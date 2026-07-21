import crypto from 'node:crypto';
import axios from 'axios';
import { getPrisma } from '../../research/prisma.js';
import { fetchFinancials, fetchPriceHistory } from '../adapters/eastmoney.js';
import { TushareProvider } from '../providers/tushare.js';

const CATEGORIES = [
  ['geopolitics', '(geopolitics OR sanctions OR war OR tariff) finance'],
  ['central-bank-policy', '(central bank OR PBOC OR Federal Reserve OR interest rate)'],
  ['industry-policy', '(industry policy OR regulation OR subsidy) economy'],
  ['economic-data', '(GDP OR CPI OR PMI OR unemployment) economy'],
];
const n = value => value == null ? null : Number(value);
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const day = date => new Date(`${new Date(date).toISOString().slice(0,10)}T00:00:00.000Z`);
const source = (name,url,fetchedAt,status='live',extra={}) => ({name,url,fetchedAt:new Date(fetchedAt).toISOString(),status,...extra});

export async function collectMajorEvents() {
  const db=getPrisma(), fetchedAt=new Date(), statuses=[], events=[],endpoint='https://api.gdeltproject.org/api/v2/doc/doc';
  try {
    // One combined request avoids multiplying public API rate-limit pressure.
    const query='(geopolitics OR sanctions OR war OR tariff OR "central bank" OR PBOC OR "Federal Reserve" OR "interest rate" OR regulation OR subsidy OR GDP OR CPI OR PMI OR unemployment) economy finance';
    const {data}=await axios.get(endpoint,{params:{query,mode:'ArtList',maxrecords:50,format:'json',sort:'HybridRel'},timeout:Number(process.env.NEWS_HTTP_TIMEOUT_MS||15000),headers:{'User-Agent':process.env.FINANCE_USER_AGENT||'ai-research-platform/1.0'}});
    const rows=Array.isArray(data?.articles)?data.articles:[];if(!rows.length)throw new Error('empty response');
    for(const row of rows){if(!row.url||!row.title)continue;const category=majorCategory(row.title),publishedAt=gdeltDate(row.seendate)||fetchedAt,canonicalKey=hash(row.url);events.push(await db.majorFinancialEvent.upsert({where:{canonicalKey},create:{canonicalKey,category,title:row.title,summary:null,publishedAt,sourceName:row.domain||'GDELT indexed publisher',sourceUrl:endpoint,articleUrl:row.url,fetchedAt,retrievalStatus:'live',raw:row},update:{category,title:row.title,publishedAt,sourceName:row.domain||'GDELT indexed publisher',articleUrl:row.url,fetchedAt,retrievalStatus:'live',raw:row}}));}
    statuses.push(source('GDELT 2.1 DOC API',endpoint,fetchedAt,'live',{categories:CATEGORIES.map(([category])=>category),count:rows.length}));
  } catch(error) {statuses.push(source('GDELT 2.1 DOC API',endpoint,fetchedAt,'degraded',{error:error.message}));}
  if(!events.length){
    const cached=await db.majorFinancialEvent.findMany({take:48,orderBy:{publishedAt:'desc'}});
    events.push(...cached);
    statuses.push(source('PostgreSQL event cache','database://major_financial_events',fetchedAt,'degraded',{count:cached.length}));
  }
  return {events:dedupe(events).sort((a,b)=>b.publishedAt-a.publishedAt).slice(0,48),statuses};
}

function majorCategory(title){const text=String(title).toLowerCase();if(/war|sanction|tariff|geopolit|战争|制裁|关税|地缘/.test(text))return'geopolitics';if(/central bank|pboc|federal reserve|interest rate|央行|人民银行|美联储|利率/.test(text))return'central-bank-policy';if(/regulation|subsidy|industry policy|监管|补贴|产业政策/.test(text))return'industry-policy';return'economic-data';}

function gdeltDate(value){if(!value)return null;const text=String(value);const match=text.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/);return match?new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]||'00'}:${match[5]||'00'}:00Z`):null;}
function dedupe(rows){return [...new Map(rows.map(x=>[String(x.id),x])).values()];}

async function stockEvidence(stock){
  const fetchedAt=new Date(), sources=[];let prices=[],financial=null;
  try{
    const rows=await fetchPriceHistory(stock.code,120);
    prices=rows.map(row=>{const [tradeDate,open,close,high,low,volume,turnover,,,changePercent,,turnoverRate]=row.split(',');return{tradeDate,open:n(open),close:n(close),high:n(high),low:n(low),volume:n(volume),turnover:n(turnover),changePercent:n(changePercent),turnoverRate:n(turnoverRate)};});
    sources.push(source('东方财富历史行情',`https://quote.eastmoney.com/${stock.code}.html`,fetchedAt,'live'));
  }catch(error){
    try{
      const end=fetchedAt.toISOString().slice(0,10).replaceAll('-',''),start=new Date(fetchedAt.getTime()-730*86400000).toISOString().slice(0,10).replaceAll('-','');
      const rows=await new TushareProvider().dailyQuotes({ts_code:`${stock.code}.${stock.code.startsWith('6')?'SH':'SZ'}`,start_date:start,end_date:end});
      prices=rows.slice(0,120).reverse().map(row=>({tradeDate:`${row.trade_date.slice(0,4)}-${row.trade_date.slice(4,6)}-${row.trade_date.slice(6,8)}`,open:n(row.open),close:n(row.close),high:n(row.high),low:n(row.low),volume:n(row.vol)*100,turnover:n(row.amount)*1000,changePercent:n(row.pct_chg)}));
      sources.push(source('Tushare 历史日线',`https://tushare.pro/document/2?doc_id=27`,fetchedAt,'live',{adjustment:'未复权',fallbackFrom:'东方财富'}));
    }catch(fallbackError){prices=stock.prices.slice().reverse().map(p=>({tradeDate:p.tradeDate.toISOString().slice(0,10),open:n(p.open),close:n(p.close),high:n(p.high),low:n(p.low),volume:n(p.volume),turnover:n(p.turnover),changePercent:n(p.changePercent)}));sources.push(source('PostgreSQL 行情缓存',`database://stock_prices/${stock.code}`,stock.prices[0]?.fetchedAt||fetchedAt,'degraded',{error:`Eastmoney: ${error.message}; Tushare: ${fallbackError.message}`}));}
  }
  try{const rows=await fetchFinancials(stock.code);financial=rows[0]||null;sources.push(source('东方财富数据中心',`https://data.eastmoney.com/bbsj/${stock.code}.html`,fetchedAt,'live'));}
  catch(error){financial=stock.statements[0]?{revenue:n(stock.statements[0].revenue),netProfit:n(stock.statements[0].netProfit),roe:n(stock.statements[0].roe),grossMargin:n(stock.statements[0].grossMargin),periodEnd:stock.statements[0].periodEnd}:null;sources.push(source('PostgreSQL 财务缓存',stock.statements[0]?.sourceUrl||`database://financial_statements/${stock.code}`,stock.statements[0]?.fetchedAt||fetchedAt,'degraded',{error:error.message}));}
  return {prices,financial,sources};
}

function analyze(stock,evidence,events){
  const closes=evidence.prices.map(x=>x.close).filter(Number.isFinite), latest=closes.at(-1), avg20=mean(closes.slice(-20)),avg60=mean(closes.slice(-60));
  const return20=closes.length>20?latest/closes.at(-21)-1:null, peak=closes.length?Math.max(...closes.slice(-60)):null,drawdown=latest&&peak?latest/peak-1:null;
  const f=evidence.financial||{}, roe=n(f.ROEJQ ?? f.ROE ?? f.roe), profitGrowth=n(f.SJLTZ ?? f.TOTALOPERATEREVETZ ?? f.netProfitGrowth);
  let score=0;if(latest>avg20)score++;else score--;if(avg20>avg60)score++;else score--;if(return20>0)score++;else score--;if(roe!=null)score+=roe>=10?1:roe<5?-1:0;if(profitGrowth!=null)score+=profitGrowth>0?1:-1;
  const sufficientHistory=closes.length>=20,recommendation=!sufficientHistory?'数据不足，暂不建议操作':score>=3?'关注买入机会':score<=-2?'减仓/回避':'持有观察';
  const risks=[];if(drawdown!=null&&drawdown<-.15)risks.push(`近60日最大回撤区间较深，当前较峰值 ${(drawdown*100).toFixed(1)}%`);if(roe!=null&&roe<5)risks.push(`ROE ${roe.toFixed(1)}% 偏低`);if(profitGrowth!=null&&profitGrowth<0)risks.push(`利润/营收同比指标为负 (${profitGrowth.toFixed(1)}%)`);if(!evidence.financial)risks.push('当前无法取得可验证基本面数据');
  const relevantEvents=events.slice(0,12).map(e=>({category:e.category,title:e.title,url:e.articleUrl,publishedAt:e.publishedAt,source:e.sourceName,fetchedAt:e.fetchedAt,status:e.retrievalStatus}));
  return {title:`${stock.name}（${stock.code}）每日投研`,summary:`趋势${!sufficientHistory?'数据不足':latest>avg20?'偏强':'偏弱'}，20日收益${return20==null?'数据不足':`${(return20*100).toFixed(1)}%`}；规则评分 ${score}，建议：${recommendation}。`,recommendation,confidence:sufficientHistory?Math.min(.9,.45+Math.abs(score)*.08):.25,content:{market:{latest,average20:avg20,average60:avg60,return20,drawdown60:drawdown,historyPoints:closes.length,observations:evidence.prices.slice(-10)},fundamentals:{latest:f,roe,profitGrowth},risk:risks.length?risks:['未触发规则化高风险项，仍需关注市场与公司公告'],majorEvents:relevantEvents,method:'基于真实/缓存降级行情、趋势与公开财务字段的确定性规则，不是收益保证。'}};
}
function mean(values){const valid=values.filter(Number.isFinite);return valid.length?valid.reduce((a,b)=>a+b,0)/valid.length:null;}

export async function runDailyAgent(ownerKey,{trigger='manual',force=false}={}){
  const db=getPrisma(),runDate=day(new Date());let run=await db.dailyAgentRun.findUnique({where:{ownerKey_runDate:{ownerKey,runDate}},include:{reports:true}});
  if(run?.status==='succeeded'&&!force)return run;
  run=await db.dailyAgentRun.upsert({where:{ownerKey_runDate:{ownerKey,runDate}},create:{ownerKey,runDate,trigger,status:'running'},update:{trigger,status:'running',startedAt:new Date(),finishedAt:null,error:null}});
  try{
    const watchlist=await db.userWatchlistStock.findMany({
      where:{ownerKey},
      include:{stock:{include:{
        prices:{take:120,orderBy:{tradeDate:'desc'}},
        statements:{take:4,orderBy:{periodEnd:'desc'}},
      }}},
    });
    const eventResult=await collectMajorEvents();
    await db.dailyAgentReport.deleteMany({where:{runId:run.id}});
    for(const entry of watchlist){const evidence=await stockEvidence(entry.stock),result=analyze(entry.stock,evidence,eventResult.events);await db.dailyAgentReport.create({data:{runId:run.id,stockId:entry.stock.id,title:result.title,summary:result.summary,recommendation:result.recommendation,confidence:result.confidence,content:result.content,sources:evidence.sources}});}
    return db.dailyAgentRun.update({where:{id:run.id},data:{status:'succeeded',finishedAt:new Date(),sourceStatus:eventResult.statuses},include:{reports:{include:{stock:{select:{code:true,name:true}}}}}});
  }catch(error){await db.dailyAgentRun.update({where:{id:run.id},data:{status:'failed',finishedAt:new Date(),error:error.message}}).catch(()=>{});throw error;}
}
