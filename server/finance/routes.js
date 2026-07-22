import { createHash } from 'node:crypto';
import { Router } from 'express';
import { getPrisma } from '../research/prisma.js';
import { marketAnalyst, newsIntelligence, stockResearch } from './agents/index.js';
import { cleanCode } from './normalize.js';
import { providerHealth } from './providers/index.js';
import { runProductionAgent } from './agents/production.js';
import { runTradingWorkflow } from './agents/trading-workflow.js';
import { fetchPriceHistory } from './adapters/eastmoney.js';
import { TushareProvider } from './providers/tushare.js';
import { collectMajorEvents, listMajorEvents } from './events/collector.js';
import { getStockQuote, getStockQuotes, getTencentPriceHistory } from '../market.js';
import { getSinaFinancials } from './providers/sina-financials.js';
import { requireAdminToken } from '../security.js';

export const financeRouter = Router();
const integer = (v, fallback, max=200) => Math.min(max, Math.max(1, Number.parseInt(v || fallback, 10) || fallback));
const meta = (source = '东方财富') => ({ source, updatedAt: new Date().toISOString(), mock: false });

financeRouter.get('/stocks', async (req, res, next) => { try {
  const db=getPrisma(), page=integer(req.query.page,1), size=integer(req.query.size || req.query.limit,20,100), where=req.query.q ? { OR:[{code:{contains:String(req.query.q)}},{name:{contains:String(req.query.q)}}] } : {};
  const [items,total]=await Promise.all([db.stock.findMany({where,skip:(page-1)*size,take:size,orderBy:{code:'asc'},include:{prices:{take:1,orderBy:{tradeDate:'desc'},include:{source:true}},industry:true}}),db.stock.count({where})]),quotes=await getStockQuotes(items.map(item=>item.code)),byCode=new Map(quotes.map(quote=>[quote.code,quote]));
  res.json({success:true,data:{items:items.map(item=>({...item,realtimeQuote:byCode.get(item.code)||null})),total,page,size},meta:{...meta('腾讯实时行情 + PostgreSQL证券主数据'),realtimeCovered:quotes.length}});
} catch(e){next(e);} });

financeRouter.get('/stocks/:code', async (req,res,next)=>{try{
  const code=cleanCode(req.params.code),stock=await getPrisma().stock.findUnique({where:{code},include:{industry:true,prices:{take:120,orderBy:{tradeDate:'desc'},include:{source:true}},statements:{take:12,orderBy:{periodEnd:'desc'},include:{source:true}},news:{take:20,orderBy:{publishedAt:'desc'},include:{source:true}},reports:{take:20,orderBy:{publishedAt:'desc'},include:{source:true}}}}); if(!stock) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Stock not found'}}); const [realtimeQuote,liveFinancials]=await Promise.all([getStockQuote(code),stock.statements.length>=4?Promise.resolve([]):getSinaFinancials(code).catch(()=>[])]),statements=stock.statements.length>=4?stock.statements:liveFinancials;res.json({success:true,data:{...stock,statements,realtimeQuote,fundamentalCoverage:{periods:statements.length,source:liveFinancials.length?'新浪财经财报三表':'PostgreSQL财务库',liveFallback:Boolean(liveFinancials.length)}},meta:{...meta(realtimeQuote?'腾讯实时行情 + 财务数据':'PostgreSQL缓存行情 + 财务数据'),realtime:!!realtimeQuote}});
} catch(e){next(e);} });

financeRouter.get('/stocks/:code/price-history', async (req,res,next)=>{try{
  const db=getPrisma(),code=cleanCode(req.params.code),limit=integer(req.query.limit,120,500),stock=await db.stock.findUnique({where:{code}});
  if(!stock)return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Stock not found'}});
  let items=[],liveError=null,sourceName='东方财富历史行情（前复权）';
  try{
    const rows=await fetchPriceHistory(code,limit),source=await db.dataSource.upsert({where:{key:'eastmoney'},create:{key:'eastmoney',name:'东方财富',kind:'market-data',baseUrl:'https://www.eastmoney.com/'},update:{enabled:true}});
    items=rows.map(row=>{const [tradeDate,open,close,high,low,volume,turnover,amplitude,changePercent,change,turnoverRate]=String(row).split(',');return{tradeDate,open:Number(open),close:Number(close),high:Number(high),low:Number(low),volume:Number(volume),turnover:Number(turnover),amplitude:Number(amplitude),changePercent:Number(changePercent),change:Number(change),turnoverRate:Number(turnoverRate),raw:row};}).filter(item=>item.tradeDate&&Number.isFinite(item.close));
    for(const item of items){const tradeDate=new Date(`${item.tradeDate}T00:00:00.000Z`),payloadHash=createHash('sha256').update(String(item.raw)).digest('hex');await db.stockPrice.upsert({where:{stockId_tradeDate_interval_sourceId:{stockId:stock.id,tradeDate,interval:'1d',sourceId:source.id}},create:{stockId:stock.id,tradeDate,open:item.open,close:item.close,high:item.high,low:item.low,changePercent:item.changePercent,volume:BigInt(Math.trunc(item.volume)),turnover:item.turnover,turnoverRate:item.turnoverRate,sourceId:source.id,providerKey:`${code}:${item.tradeDate}`,sourceUrl:`https://quote.eastmoney.com/${code}.html`,payloadHash,raw:{kline:item.raw,adjustment:'forward'}},update:{open:item.open,close:item.close,high:item.high,low:item.low,changePercent:item.changePercent,volume:BigInt(Math.trunc(item.volume)),turnover:item.turnover,turnoverRate:item.turnoverRate,fetchedAt:new Date(),payloadHash,raw:{kline:item.raw,adjustment:'forward'}}});}
  }catch(error){
    liveError=error.message;
    try{
      items=(await getTencentPriceHistory(code,limit)).slice(-limit);if(items.length<2)throw new Error('Tencent returned insufficient history');
      const source=await db.dataSource.upsert({where:{key:'tencent'},create:{key:'tencent',name:'腾讯财经',kind:'market-data',baseUrl:'https://gu.qq.com/'},update:{enabled:true}});
      await db.stockPrice.createMany({skipDuplicates:true,data:items.map(item=>({stockId:stock.id,tradeDate:new Date(`${item.tradeDate}T00:00:00.000Z`),interval:'1d',open:item.open,close:item.close,high:item.high,low:item.low,changePercent:item.changePercent,volume:BigInt(Math.trunc(item.volume||0)),turnover:item.turnover,sourceId:source.id,providerKey:`${code}:${item.tradeDate}`,sourceUrl:`https://gu.qq.com/${code.startsWith('6')?'sh':'sz'}${code}`,payloadHash:createHash('sha256').update(JSON.stringify(item.raw)).digest('hex'),raw:{kline:item.raw,adjustment:'forward'}}))});
      sourceName='腾讯历史日线行情（前复权）';liveError=null;
    }catch(tencentError){try{
      const end=new Date().toISOString().slice(0,10).replaceAll('-',''),start=new Date(Date.now()-730*86400000).toISOString().slice(0,10).replaceAll('-',''),rows=await new TushareProvider().dailyQuotes({ts_code:`${code}.${code.startsWith('6')?'SH':'SZ'}`,start_date:start,end_date:end});
      items=rows.slice(0,limit).reverse().map(row=>({tradeDate:`${row.trade_date.slice(0,4)}-${row.trade_date.slice(4,6)}-${row.trade_date.slice(6,8)}`,open:Number(row.open),close:Number(row.close),high:Number(row.high),low:Number(row.low),volume:Number(row.vol)*100,turnover:Number(row.amount)*1000,changePercent:Number(row.pct_chg),change:Number(row.change),raw:row}));
      const source=await db.dataSource.upsert({where:{key:'tushare'},create:{key:'tushare',name:'Tushare',kind:'market-data',baseUrl:'https://tushare.pro/'},update:{enabled:true}});
      await db.stockPrice.createMany({skipDuplicates:true,data:items.map(item=>({stockId:stock.id,tradeDate:new Date(`${item.tradeDate}T00:00:00.000Z`),interval:'1d',open:item.open,close:item.close,high:item.high,low:item.low,changePercent:item.changePercent,volume:BigInt(Math.trunc(item.volume)),turnover:item.turnover,sourceId:source.id,providerKey:`${code}:${item.tradeDate}`,sourceUrl:'https://tushare.pro/document/2?doc_id=27',payloadHash:createHash('sha256').update(JSON.stringify(item.raw)).digest('hex'),raw:{...item.raw,adjustment:'none'}}))});
      sourceName='Tushare 历史日线行情（未复权）';liveError=null;
    }catch(fallbackError){liveError=`Eastmoney: ${error.message}; Tencent: ${tencentError.message}; Tushare: ${fallbackError.message}`;}}
  }
  if(!items.length){const cached=await db.stockPrice.findMany({where:{stockId:stock.id,interval:'1d'},take:limit,orderBy:{tradeDate:'desc'},include:{source:true}});items=cached.reverse().map(item=>({tradeDate:item.tradeDate.toISOString().slice(0,10),open:Number(item.open),close:Number(item.close),high:Number(item.high),low:Number(item.low),volume:Number(item.volume),turnover:Number(item.turnover),changePercent:Number(item.changePercent)}));}
  if(items.length<2)throw Object.assign(new Error(liveError||'Insufficient verified price history'),{status:502,code:'PRICE_HISTORY_UNAVAILABLE'});
  res.json({success:true,data:{code,interval:'1d',items},meta:{...meta(sourceName),live:!liveError,stale:Boolean(liveError),warning:liveError||undefined}});
}catch(e){next(e);}});

financeRouter.get('/decision/:code', async(req,res,next)=>{try{
  const mode=req.query.mode==='llm'?'llm':req.query.mode==='deterministic'?'deterministic':'auto';
  res.json({success:true,data:await runTradingWorkflow(cleanCode(req.params.code),{mode}),meta:meta('PostgreSQL evidence + TradingAgents workflow')});
}catch(e){next(e);}});

financeRouter.get('/market/trend', async (req,res,next)=>{try{
  const db=getPrisma(), limit=integer(req.query.limit,100,500), indicators=await db.marketIndicator.findMany({take:limit,orderBy:{observedAt:'desc'},include:{source:true}}); res.json({success:true,data:{indicators,analysis:marketAnalyst(indicators)},meta:meta()});
} catch(e){next(e);} });

financeRouter.get('/news', async(req,res,next)=>{try{
  const db=getPrisma(), size=integer(req.query.size || req.query.limit,30,100), where=req.query.code ? {stock:{code:cleanCode(req.query.code)}} : {}; const items=await db.newsArticle.findMany({where,take:size,orderBy:{publishedAt:'desc'},include:{stock:{select:{code:true,name:true}},source:true}}); res.json({success:true,data:{items,analysis:newsIntelligence(items)},meta:meta()});
} catch(e){next(e);} });

financeRouter.get('/analysis/:code', async(req,res,next)=>{try{
  const db=getPrisma(), code=cleanCode(req.params.code), stock=await db.stock.findUnique({where:{code},include:{prices:{take:1,orderBy:{tradeDate:'desc'}},statements:{take:1,orderBy:{periodEnd:'desc'}},news:{take:30,orderBy:{publishedAt:'desc'}}}}); if(!stock) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Stock not found'}}); const analyses=[stockResearch(stock),newsIntelligence(stock.news)]; res.json({success:true,data:{code,generatedAt:new Date(),analyses,disclosure:'Deterministic rule outputs; not an LLM/model prediction or investment advice.'},meta:meta('PostgreSQL + deterministic agents')});
} catch(e){next(e);} });

financeRouter.get('/providers/health', async(_req,res,next)=>{try{res.json({success:true,data:await providerHealth(),meta:meta('provider registry')});}catch(e){next(e);}});
financeRouter.get('/agents/:agent/:code', async(req,res,next)=>{try{const data=await runProductionAgent(req.params.agent,cleanCode(req.params.code));res.json({success:true,data,meta:meta('audited production agent')});}catch(e){next(e);}});
financeRouter.get('/news/clusters', async(req,res,next)=>{try{const data=await getPrisma().newsCluster.findMany({take:integer(req.query.limit,30,100),orderBy:{lastSeenAt:'desc'},include:{members:{take:5,include:{article:{select:{id:true,title:true,publishedAt:true,url:true}}}}}});res.json({success:true,data,meta:meta('PostgreSQL news intelligence')});}catch(e){next(e);}});
financeRouter.get('/events/impacts', async(req,res,next)=>{try{const where=req.query.code?{stock:{code:cleanCode(req.query.code)}}:{};const data=await getPrisma().eventImpact.findMany({where,take:integer(req.query.limit,50,200),orderBy:{calculatedAt:'desc'},include:{event:true,stock:{select:{code:true,name:true}}}});res.json({success:true,data,meta:meta('event-window-v1')});}catch(e){next(e);}});

financeRouter.get('/events/major',async(req,res,next)=>{try{if(!process.env.DATABASE_URL)return res.json({success:true,data:{items:[],events:[],source:[],status:'unavailable',fetchedAt:new Date(),coverage:{returned:0,note:'需配置 DATABASE_URL 后存储重大事件'}},meta:{mock:false,source:'无数据库预览模式',status:'unavailable',fetchedAt:new Date()}});const data=await listMajorEvents({limit:integer(req.query.limit,50,200),category:req.query.category?String(req.query.category):undefined});res.json({success:true,data,meta:{mock:false,source:data.source,status:data.status,fetchedAt:data.fetchedAt,coverage:data.coverage}});}catch(e){next(e);}});
financeRouter.post('/events/major/refresh',async(req,res,next)=>{try{requireAdminToken(req,'SCHEDULER_REFRESH_TOKEN','x-scheduler-token');const data=await collectMajorEvents();res.json({success:true,data:{items:data.events,statuses:data.statuses},meta:{mock:false,source:data.statuses.map(x=>x.source),status:data.status,fetchedAt:data.fetchedAt,coverage:data.coverage,schedulerSafe:true,noOverlap:true}});}catch(e){next(e);}});
