import { Router } from 'express';
import { getPrisma } from '../../research/prisma.js';
import { getMarketBreadth, getMarketIndexes, getStockQuote } from '../../market.js';
import { analyzePortfolio, ownerKey } from '../portfolio/service.js';
import { runProductionAgent } from '../agents/production.js';
import { marketAnalyst } from '../agents/index.js';

export const experienceRouter=Router();
const databaseAvailable=()=>Boolean(process.env.DATABASE_URL);

async function liveMarketAnalysis(){
  const [indexes,breadth]=await Promise.all([getMarketIndexes(),getMarketBreadth()]);
  const observedAt=new Date();
  const indicators=indexes.map(index=>({key:`index.${index.code}.change_pct`,value:index.change,observedAt}));
  const market=marketAnalyst(indicators);
  return {...market,summary:`${market.summary} 实时市场覆盖上涨 ${breadth.upCount||0}、下跌 ${breadth.downCount||0}、平盘 ${breadth.flatCount||0}。`,evidence:indexes.map(index=>({key:index.name,value:index.change,price:index.price,observedAt}))};
}

experienceRouter.get('/command-center',async(req,res,next)=>{try{
  let indicators=[],clusters=[],events=[],portfolioRisk=null;
  if(databaseAvailable()){
    const db=getPrisma();
    [indicators,clusters,events]=await Promise.all([db.marketIndicator.findMany({take:12,orderBy:{observedAt:'desc'},include:{source:true}}),db.newsCluster.findMany({take:6,orderBy:{lastSeenAt:'desc'}}),db.event.findMany({take:8,orderBy:{occurredAt:'desc'},include:{article:{select:{url:true}}}})]);
    if(req.query.portfolioId)portfolioRisk=(await analyzePortfolio(req.query.portfolioId,ownerKey(req))).risk;
  }
  const market=indicators.length?marketAnalyst(indicators):await liveMarketAnalysis(),brief=[market.summary,...events.slice(0,3).map(event=>`${event.eventType}: ${event.title}`)];
  res.json({success:true,data:{marketSummary:market,portfolioRisk,dailyBrief:{generatedAt:new Date(),items:brief,method:'deterministic evidence synthesis'},hotEvents:events,hotTopics:clusters,quickActions:[{id:'ask-ai',label:'询问 AI'},{id:'add-holding',label:'添加持仓'},{id:'import-portfolio',label:'导入组合'},{id:'research-stock',label:'研究股票'}]},meta:{source:databaseAvailable()?'Real market indicators, portfolio data and news events':'腾讯实时行情（无数据库预览模式）',status:databaseAvailable()?'live':'live-preview',updatedAt:new Date(),mock:false}});
}catch(e){next(e);}});

experienceRouter.post('/assistant/chat',async(req,res,next)=>{try{
  const question=String(req.body?.question||'').trim();
  if(!question)return res.status(400).json({success:false,error:{code:'QUESTION_REQUIRED',message:'question is required'}});
  const code=(question.match(/\b\d{6}\b/)||[])[0]||req.body?.stockCode;
  let answer,analyses=[],citations=[];
  if(!databaseAvailable()){
    if(code){
      const quote=await getStockQuote(code);
      if(!quote)throw Object.assign(new Error('Realtime quote unavailable'),{status:502,code:'QUOTE_UNAVAILABLE'});
      answer=`${quote.name}（${quote.code}）最新价 ${quote.price}，涨跌幅 ${quote.change}%；当前为无数据库预览模式，仅根据实时行情回答，无法调用财务、新闻和组合证据。`;
      citations=[{sourceType:'realtime_quote',sourceId:quote.code,title:`${quote.name} 实时行情`,quotedData:quote}];
      analyses=[{agent:'market-agent',summary:answer,evidence:citations}];
    }else{
      const market=await liveMarketAnalysis();
      answer=`${market.summary} 如需分析个股，请在问题中提供 6 位股票代码。`;
      citations=market.evidence.map((item,index)=>({sourceType:'realtime_index',sourceId:String(index),title:item.key,quotedData:item}));
      analyses=[market];
    }
  }else if(/组合|持仓|仓位|风险/.test(question)&&req.body?.portfolioId){
    const result=await analyzePortfolio(req.body.portfolioId,ownerKey(req));answer=`组合当前风险等级 ${result.risk.level}，风险分 ${result.risk.score.toFixed(1)}。${result.rebalance.map(x=>x.reason).join('；')}`;citations=result.citations;analyses=[{agent:'portfolio-intelligence',result}];
  }else if(code){
    const selected=/风险|卖出|减仓/.test(question)?['risk','research']:['market','research'];for(const agent of selected)analyses.push(await runProductionAgent(agent,code));answer=analyses.map(x=>x.summary).join('\n');citations=analyses.flatMap(x=>x.citations||[]);
  }else{
    const indicators=await getPrisma().marketIndicator.findMany({take:12,orderBy:{observedAt:'desc'}}),market=marketAnalyst(indicators);answer=`${market.summary} 如需分析个股，请在问题中提供 6 位股票代码。`;citations=market.evidence.map((x,i)=>({sourceType:'market_indicator',sourceId:String(i),title:x.key,quotedData:x}));analyses=[market];
  }
  res.json({success:true,data:{answer,question,agents:analyses.map(x=>x.agent),analyses,citations,confidence:citations.length?Math.min(.95,.5+citations.length*.03):.35,cost:{inputTokens:0,outputTokens:0,costUsd:0},disclosure:'当前由透明规则 Agent 路由与证据合成，不构成投资建议。'},meta:{updatedAt:new Date(),mock:false,database:databaseAvailable()?'connected':'preview-unavailable'}});
}catch(e){next(e);}});
