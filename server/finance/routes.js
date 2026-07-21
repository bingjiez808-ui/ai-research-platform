import { Router } from 'express';
import { getPrisma } from '../research/prisma.js';
import { marketAnalyst, newsIntelligence, stockResearch } from './agents/index.js';
import { cleanCode } from './normalize.js';
import { providerHealth } from './providers/index.js';
import { runProductionAgent } from './agents/production.js';

export const financeRouter = Router();
const integer = (v, fallback, max=200) => Math.min(max, Math.max(1, Number.parseInt(v || fallback, 10) || fallback));
const meta = (source = '东方财富') => ({ source, updatedAt: new Date().toISOString(), mock: false });

financeRouter.get('/stocks', async (req, res, next) => { try {
  const db=getPrisma(), page=integer(req.query.page,1), size=integer(req.query.size || req.query.limit,20,100), where=req.query.q ? { OR:[{code:{contains:String(req.query.q)}},{name:{contains:String(req.query.q)}}] } : {};
  const [items,total]=await Promise.all([db.stock.findMany({where,skip:(page-1)*size,take:size,orderBy:{code:'asc'},include:{prices:{take:1,orderBy:{tradeDate:'desc'},include:{source:true}},industry:true}}),db.stock.count({where})]);
  res.json({success:true,data:{items,total,page,size},meta:meta()});
} catch(e){next(e);} });

financeRouter.get('/stocks/:code', async (req,res,next)=>{try{
  const stock=await getPrisma().stock.findUnique({where:{code:cleanCode(req.params.code)},include:{industry:true,prices:{take:120,orderBy:{tradeDate:'desc'},include:{source:true}},statements:{take:12,orderBy:{periodEnd:'desc'},include:{source:true}},news:{take:20,orderBy:{publishedAt:'desc'},include:{source:true}},reports:{take:20,orderBy:{publishedAt:'desc'},include:{source:true}}}}); if(!stock) return res.status(404).json({success:false,error:{code:'NOT_FOUND',message:'Stock not found'}}); res.json({success:true,data:stock,meta:meta()});
} catch(e){next(e);} });

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
