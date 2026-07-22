import { getPrisma } from '../research/prisma.js';
import { TushareProvider } from './providers/tushare.js';
import { ingestTushareDaily, ingestTushareFinancials } from './providers/ingest-tushare.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ymd=date=>date.toISOString().slice(0,10).replaceAll('-','');
const marketSuffix=code=>String(code).startsWith('6')?'SH':'SZ';

export function recentWeekdays(count=45,now=new Date()){
  const days=[];
  for(let cursor=new Date(now);days.length<count;cursor=new Date(cursor.getTime()-86400000)){
    const weekday=cursor.getUTCDay();
    if(weekday!==0&&weekday!==6)days.push(ymd(cursor));
  }
  return days.reverse();
}

export async function backfillMarketEvidence({historyDays=45,maxFinancials=20}={}){
  const provider=new TushareProvider();
  if(!provider.isConfigured())return{skipped:true,reason:'tushare-not-configured'};
  const db=getPrisma(),source=await db.dataSource.findUnique({where:{key:'tushare'}}),dates=recentWeekdays(historyDays);
  const existing=source?await db.stockPrice.groupBy({by:['tradeDate'],where:{sourceId:source.id,interval:'1d',tradeDate:{in:dates.map(value=>new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T00:00:00Z`))}},_count:{_all:true}}):[];
  const covered=new Set(existing.filter(row=>row._count._all>=1000).map(row=>ymd(row.tradeDate))),daily=[];
  for(const tradeDate of dates.filter(value=>!covered.has(value))){
    try{daily.push(await ingestTushareDaily(tradeDate));}
    catch(error){daily.push({tradeDate,error:error.message});}
    await sleep(Number(process.env.TUSHARE_BACKFILL_DELAY_MS||850));
  }
  const configured=(process.env.TUSHARE_WATCHLIST||'').split(',').map(value=>value.trim()).filter(Boolean),financials=[];
  for(const raw of configured.slice(0,maxFinancials)){
    const digits=raw.replace(/\D/g,'').slice(0,6),tsCode=raw.includes('.')?raw:`${digits}.${marketSuffix(digits)}`;
    try{financials.push({tsCode,...await ingestTushareFinancials(tsCode)});}
    catch(error){financials.push({tsCode,error:error.message});}
    await sleep(Number(process.env.TUSHARE_BACKFILL_DELAY_MS||850));
  }
  return{historyDays,datesRequested:daily.length,daily,financials,finishedAt:new Date().toISOString()};
}
