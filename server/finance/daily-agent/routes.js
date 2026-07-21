import { Router } from 'express';
import { getPrisma } from '../../research/prisma.js';
import { cleanCode } from '../normalize.js';
import { ownerKey } from '../portfolio/service.js';
import { runDailyAgent } from './service.js';
import { collectMajorEvents } from '../events/collector.js';

export const dailyAgentRouter=Router();
const limit=(value,fallback=30,max=100)=>Math.min(max,Math.max(1,Number.parseInt(value||fallback,10)||fallback));

// User watchlist CRUD. X-Owner-Key is required and scopes every operation.
dailyAgentRouter.get('/watchlist',async(req,res,next)=>{try{const data=await getPrisma().userWatchlistStock.findMany({
  where:{ownerKey:ownerKey(req)},orderBy:{createdAt:'desc'},
  include:{stock:{include:{industry:true,prices:{take:1,orderBy:{tradeDate:'desc'}}}}},
});res.json({success:true,data});}catch(e){next(e);}});
dailyAgentRouter.post('/watchlist',async(req,res,next)=>{try{const db=getPrisma(),owner=ownerKey(req),code=cleanCode(req.body?.stockCode),stock=await db.stock.findUnique({where:{code}});if(!stock)return res.status(422).json({success:false,error:{code:'STOCK_NOT_INDEXED',message:`Stock ${code} is not indexed`}});const data=await db.userWatchlistStock.upsert({where:{ownerKey_stockId:{ownerKey:owner,stockId:stock.id}},create:{ownerKey:owner,stockId:stock.id,note:req.body?.note||null},update:{note:req.body?.note||null},include:{stock:true}});res.status(201).json({success:true,data});}catch(e){next(e);}});
dailyAgentRouter.put('/watchlist',async(req,res,next)=>{try{
  const db=getPrisma(),owner=ownerKey(req),items=Array.isArray(req.body?.items)?req.body.items:[],codes=[...new Set(items.map(item=>cleanCode(item?.stockCode)).filter(Boolean))].slice(0,100);
  const stocks=await db.stock.findMany({where:{code:{in:codes}}});const byCode=new Map(stocks.map(stock=>[stock.code,stock]));const missing=codes.filter(code=>!byCode.has(code));
  if(missing.length)return res.status(422).json({success:false,error:{code:'STOCK_NOT_INDEXED',message:`以下股票尚未入库：${missing.join('、')}`,missing}});
  await db.$transaction(async tx=>{await tx.userWatchlistStock.deleteMany({where:{ownerKey:owner}});for(const item of items){const code=cleanCode(item?.stockCode),stock=byCode.get(code);if(stock)await tx.userWatchlistStock.create({data:{ownerKey:owner,stockId:stock.id,note:item?.note?String(item.note).slice(0,1000):null}});}});
  const data=await db.userWatchlistStock.findMany({where:{ownerKey:owner},orderBy:{createdAt:'desc'},include:{stock:{include:{industry:true,prices:{take:1,orderBy:{tradeDate:'desc'}}}}}});
  res.json({success:true,data,meta:{source:'用户主动维护',mock:false,updatedAt:new Date()}});
}catch(e){next(e);}});
dailyAgentRouter.patch('/watchlist/:id',async(req,res,next)=>{try{const db=getPrisma(),owner=ownerKey(req),item=await db.userWatchlistStock.findFirst({where:{id:BigInt(req.params.id),ownerKey:owner}});if(!item)return res.status(404).json({success:false,error:{code:'WATCHLIST_ITEM_NOT_FOUND',message:'Watchlist item not found'}});const data=await db.userWatchlistStock.update({where:{id:item.id},data:{note:req.body?.note==null?null:String(req.body.note).slice(0,1000)},include:{stock:true}});res.json({success:true,data});}catch(e){next(e);}});
dailyAgentRouter.delete('/watchlist/:id',async(req,res,next)=>{try{const db=getPrisma(),owner=ownerKey(req),result=await db.userWatchlistStock.deleteMany({where:{id:BigInt(req.params.id),ownerKey:owner}});if(!result.count)return res.status(404).json({success:false,error:{code:'WATCHLIST_ITEM_NOT_FOUND',message:'Watchlist item not found'}});res.status(204).end();}catch(e){next(e);}});

dailyAgentRouter.post('/daily-agent/run',async(req,res,next)=>{try{const data=await runDailyAgent(ownerKey(req),{trigger:'manual',force:req.body?.force===true});res.status(data.status==='succeeded'?200:202).json({success:true,data,meta:{mock:false,disclosure:'Explicit rule-based research, not investment advice.'}});}catch(e){next(e);}});
dailyAgentRouter.get('/daily-agent/runs',async(req,res,next)=>{try{const data=await getPrisma().dailyAgentRun.findMany({where:{ownerKey:ownerKey(req)},take:limit(req.query.limit),orderBy:{runDate:'desc'},include:{reports:{include:{stock:{select:{code:true,name:true}}}}}});res.json({success:true,data});}catch(e){next(e);}});
dailyAgentRouter.get('/daily-agent/latest',async(req,res,next)=>{try{if(!process.env.DATABASE_URL)return res.json({success:true,data:{status:'preview',source:'无数据库预览模式',reports:[],sourceStatus:[],finishedAt:null},meta:{mock:false,status:'preview'}});const data=await getPrisma().dailyAgentRun.findFirst({where:{ownerKey:ownerKey(req),status:'succeeded'},orderBy:{runDate:'desc'},include:{reports:{orderBy:{generatedAt:'desc'},include:{stock:{select:{code:true,name:true}}}}}});if(!data)return res.status(404).json({success:false,error:{code:'REPORT_NOT_FOUND',message:'No completed daily report'}});res.json({success:true,data});}catch(e){next(e);}});

dailyAgentRouter.get('/home/feed',async(req,res,next)=>{try{const db=getPrisma(),owner=ownerKey(req),take=limit(req.query.limit,30,100);const [latestReport,events]=await Promise.all([db.dailyAgentRun.findFirst({where:{ownerKey:owner,status:'succeeded'},orderBy:{runDate:'desc'},include:{reports:{include:{stock:{select:{code:true,name:true}}}}}}),db.majorFinancialEvent.findMany({take,orderBy:{publishedAt:'desc'}})]);res.json({success:true,data:{latestReport,events},meta:{mock:false,eventDataStatus:events.length?'stored-live-observations':'unavailable',returnedAt:new Date()}});}catch(e){next(e);}});
dailyAgentRouter.get('/market/major-events',async(req,res,next)=>{try{const items=await getPrisma().majorFinancialEvent.findMany({take:limit(req.query.limit,30,100),orderBy:{publishedAt:'desc'}});res.json({success:true,data:{items,events:items},meta:{source:'GDELT 公开实时新闻索引',mock:false,status:items.length?'真实已存储':'暂不可用',updatedAt:new Date()}});}catch(e){next(e);}});
dailyAgentRouter.post('/events/refresh',async(req,res,next)=>{try{ownerKey(req);const data=await collectMajorEvents();res.json({success:true,data,meta:{mock:false}});}catch(e){next(e);}});

// Scheduler-safe: secret required, date+owner uniqueness makes retries idempotent.
dailyAgentRouter.post('/internal/scheduler/daily-agent',async(req,res,next)=>{try{const configured=process.env.DAILY_AGENT_SCHEDULER_TOKEN;if(!configured)throw Object.assign(new Error('DAILY_AGENT_SCHEDULER_TOKEN is not configured'),{status:503,code:'SCHEDULER_NOT_CONFIGURED'});if(req.get('x-scheduler-token')!==configured)throw Object.assign(new Error('Invalid scheduler token'),{status:401,code:'INVALID_SCHEDULER_TOKEN'});const db=getPrisma(),rows=await db.userWatchlistStock.findMany({distinct:['ownerKey'],select:{ownerKey:true}}),results=[];for(const {ownerKey:owner} of rows){try{const run=await runDailyAgent(owner,{trigger:'scheduler'});results.push({ownerKey:owner,status:run.status,runId:String(run.id)});}catch(error){results.push({ownerKey:owner,status:'failed',error:error.message});}}res.json({success:results.every(x=>x.status==='succeeded'),data:{scheduledFor:'08:30 Asia/Shanghai',owners:results.length,results}});}catch(e){next(e);}});
