import { getPool } from '../research/db.js';
import { getPrisma } from '../research/prisma.js';
import { ingestMarketIndicators, ingestQuotes, ingestStockDocuments } from '../finance/ingestion.js';
import { processNews } from '../finance/news/pipeline.js';
import { collectLicensedNews } from '../finance/news/sources.js';
import { calculateEventImpacts } from '../finance/events/impact.js';
import { runProductionAgent } from '../finance/agents/production.js';
import { TushareProvider } from '../finance/providers/tushare.js';
import { ingestTushareBasic, ingestTushareDaily, ingestTushareFinancials } from '../finance/providers/ingest-tushare.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const lockId = name => [...name].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) | 0, 0);
const tushare = new TushareProvider();
const shanghaiDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('-','');
async function isTradingDay(day=shanghaiDate()){if(!tushare.isConfigured())return true;const rows=await tushare.tradeCalendar(day);return rows[0]?.is_open===1;}

export async function withDistributedLock(jobName, fn) {
  const pool=await getPool(); const client=await pool.connect(); const key=lockId(`finance:${jobName}`);
  try { const {rows:[row]}=await client.query('SELECT pg_try_advisory_lock($1) acquired',[key]); if(!row.acquired) return {skipped:true,reason:'lock-held'}; return await fn(); }
  finally { await client.query('SELECT pg_advisory_unlock($1)',[key]).catch(()=>{}); client.release(); }
}

export async function runScheduledJob(jobName,{maxAttempts=3}={}) {
  return withDistributedLock(jobName,async()=>{
    const db=getPrisma(); const execution=await db.jobExecution.create({data:{jobName,scheduledAt:new Date(),lockKey:`finance:${jobName}`}}); let lastError;
    for(let attempt=1;attempt<=maxAttempts;attempt++) try {
      let result;
      if(jobName==='trade-calendar-refresh') result={calendar:await tushare.probeHealth(new Date().toISOString().slice(0,10))};
      else if(jobName==='stock-basic-weekly') result={tushare:await ingestTushareBasic()};
      else if(jobName==='financial-weekly') {const codes=(process.env.TUSHARE_WATCHLIST||'').split(',').filter(Boolean);const financials=[];for(const code of codes)financials.push(await ingestTushareFinancials(code.trim()));result={financials};}
      else if(jobName==='market-open') result={quotes:await ingestQuotes(),indicators:await ingestMarketIndicators()};
      else if(jobName==='market-close') {const day=shanghaiDate();if(!await isTradingDay(day))result={skipped:true,reason:'exchange-closed',tradeDate:day};else result={quotes:await ingestQuotes(),indicators:await ingestMarketIndicators(),tushare:tushare.isConfigured()?await ingestTushareDaily(day):{skipped:true,reason:'not-configured'}};}
      else if(jobName==='nightly') { const day=shanghaiDate();if(!await isTradingDay(day))result={skipped:true,reason:'exchange-closed',tradeDate:day};else{const codes=(process.env.FINANCE_WATCHLIST||'').split(',').filter(Boolean); const documents=[]; for(const code of codes) documents.push(await ingestStockDocuments(code.trim())); const collection=await collectLicensedNews(); const news=await processNews(); const impacts=await calculateEventImpacts(); const analyses=[]; for(const code of codes) for(const agent of ['research','market','risk']) analyses.push(String((await runProductionAgent(agent,code.trim())).id)); result={documents,collection,news,impacts,analyses};}}
      else throw new Error(`Unknown scheduled job ${jobName}`);
      await db.jobExecution.update({where:{id:execution.id},data:{status:'succeeded',attempt,finishedAt:new Date(),result}}); return result;
    } catch(error) { lastError=error; await db.jobExecution.update({where:{id:execution.id},data:{attempt,error:error.message,result:{code:error.code||'JOB_ERROR',retryAfter:error.retryAfter||null}}}); const maxDelay=Number(process.env.SCHEDULER_MAX_RETRY_DELAY_MS||60000),requested=error.retryAfter?error.retryAfter*1000:null;if(attempt<maxAttempts&&!(requested&&requested>maxDelay))await sleep(Math.min(maxDelay,requested||1000*2**(attempt-1)));else break; }
    await db.jobExecution.update({where:{id:execution.id},data:{status:'failed',finishedAt:new Date(),error:lastError.message}}); throw lastError;
  });
}
