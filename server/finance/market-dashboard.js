import { Router } from 'express';
import { getPrisma } from '../research/prisma.js';
import { getMarketIndexes, getMarketBreadth, getStockQuotes } from '../market.js';
import { getIndustryRanking } from '../eastmoney.js';
import { marketAnalyst, stockResearch } from './agents/index.js';
import { analyzePortfolio, ownerKey } from './portfolio/service.js';
import { scanLiveMarket } from './live-market-scan.js';
import { getHotSectorRecommendations } from './hot-sectors.js';
import { getNewsIntelligence } from './news-intelligence.js';
import { evaluateStrategy } from './strategy-evaluator.js';
import { buildRecommendationSummary, buildTradePlan, decisionLabel, weightedScore } from './trade-plan.js';

export const marketDashboardRouter = Router();
const asNumber = value => value == null ? null : Number(value);
const clamp = value => Math.max(0, Math.min(100, value));
const disclosure = '透明确定性规则，仅供研究；不预测收益、不构成投资建议。行情可能延迟，历史信号不代表未来表现。';

async function realtimeIndustryRanking(){const db=getPrisma(),stocks=await db.stock.findMany({where:{status:'listed',industryId:{not:null}},select:{code:true,name:true,industry:{select:{name:true}}}}),quotes=await getStockQuotes(stocks.map(stock=>stock.code)),stockByCode=new Map(stocks.map(stock=>[stock.code,stock])),groups=new Map();for(const quote of quotes){const stock=stockByCode.get(quote.code),name=stock?.industry?.name;if(!name)continue;const group=groups.get(name)||{name,changes:[],stocks:[]};group.changes.push(Number(quote.change));group.stocks.push({code:quote.code,name:stock.name,price:quote.price,changePercent:quote.change});groups.set(name,group);}return[...groups.values()].map(group=>({name:group.name,changePercent:group.changes.reduce((sum,value)=>sum+value,0)/group.changes.length,stockCount:group.stocks.length,topStocks:group.stocks.sort((a,b)=>b.changePercent-a.changePercent).slice(0,5),source:'腾讯实时行情（当前入库股票行业聚合）'})).sort((a,b)=>b.changePercent-a.changePercent);}
async function dashboardMetrics() {
  const [indexes, breadth, providerIndustries] = await Promise.all([
    getMarketIndexes(), getMarketBreadth(), getIndustryRanking().catch(() => []),
  ]);
  const industries=providerIndustries.length?providerIndustries:process.env.DATABASE_URL?await realtimeIndustryRanking():[];
  return { indexes, breadth, industries: industries.slice(0, 10) };
}

marketDashboardRouter.get('/market/dashboard', async (_req, res, next) => { try {
  const data = await dashboardMetrics();
  res.json({ success:true, data, meta:{ sources:['腾讯实时行情','Tushare上市全集（配置时）','东方财富行业'], mock:false, updatedAt:new Date(), breadthStatus:data.breadth.status } });
} catch (error) { next(error); } });

marketDashboardRouter.get('/market/hot-sectors',async(_req,res,next)=>{try{const data=await getHotSectorRecommendations();res.json({success:true,data,meta:{source:['新浪财经 7×24','财联社免费电报','巨潮公告','PostgreSQL关联A股行情'],status:data.items.some(item=>item.score!=null)?'live':'insufficient-evidence',mock:false,updatedAt:data.asOf,coverage:data.coverage}});}catch(error){next(error);}});
marketDashboardRouter.get('/market/news-intelligence',async(_req,res,next)=>{try{const data=await getNewsIntelligence();res.json({success:true,data,meta:{source:['已入库今日新闻','关联A股行情','透明量化关注度模型'],status:data.keywords.length?'live':'insufficient-evidence',mock:false,updatedAt:data.asOf,coverage:data.coverage}});}catch(error){next(error);}});
marketDashboardRouter.post('/strategies/evaluate',async(req,res,next)=>{try{const data=await evaluateStrategy(req.body||{});res.json({success:true,data,meta:{source:'PostgreSQL真实行情与财务数据',status:data.items.length?'live':'insufficient-evidence',mock:false,updatedAt:data.asOf,coverage:data.coverage}});}catch(error){next(error);}});

marketDashboardRouter.get('/market/ai-summary', async (_req, res, next) => { try {
  const metrics=await dashboardMetrics(),db=process.env.DATABASE_URL?getPrisma():null;
  const [indicators,events,statements]=db?await Promise.all([db.marketIndicator.findMany({take:100,orderBy:{observedAt:'desc'},include:{source:true}}),db.majorFinancialEvent.findMany({take:30,orderBy:{publishedAt:'desc'}}),db.financialStatement.findMany({take:100,orderBy:{periodEnd:'desc'},select:{roe:true,netProfit:true,periodEnd:true}})]):[[],[],[]];
  const auditedAgent=marketAnalyst(indicators);
  const valid=metrics.breadth.totalCount||0, up=metrics.breadth.upCount||0, down=metrics.breadth.downCount||0;
  const indexEvidence=metrics.indexes.map(x=>({code:x.code,name:x.name,price:x.price,changePercent:x.change}));
  const summary=valid ? `沪深统计覆盖 ${valid} 只有效行情，上涨 ${up}、下跌 ${down}、平盘 ${metrics.breadth.flatCount||0}；市场广度${up>down?'偏强':up<down?'偏弱':'均衡'}。` : '实时市场广度不可用，不生成方向性结论。';
  const avgRoe=statements.map(row=>asNumber(row.roe)).filter(Number.isFinite),negativeEvents=events.filter(event=>/战争|制裁|关税|风险|下调|冲突|war|sanction|tariff|risk/i.test(`${event.title} ${event.summary||''}`));
  const agents=[
    {role:'market',name:'市场 Agent',view:`${summary} 主要指数平均涨跌 ${indexEvidence.length?(indexEvidence.reduce((sum,item)=>sum+(item.changePercent||0),0)/indexEvidence.length).toFixed(2):'—'}%。`,evidence:indexEvidence},
    {role:'fundamental',name:'基本面 Agent',view:avgRoe.length?`最新财务样本 ${avgRoe.length} 条，平均 ROE ${ (avgRoe.reduce((a,b)=>a+b,0)/avgRoe.length).toFixed(2)}%；该样本仅代表已入库公司。`:'当前没有足够的最新财务样本，不形成方向性结论。',evidence:statements.slice(0,10)},
    {role:'news',name:'新闻 Agent',view:`纳入 ${events.length} 条最新重大财经事件，其中规则识别风险事件 ${negativeEvents.length} 条。`,evidence:events.slice(0,10).map(event=>({title:event.title,category:event.category,url:event.articleUrl,publishedAt:event.publishedAt}))},
    {role:'risk',name:'风险 Agent',view:`市场下跌家数 ${down}，风险事件 ${negativeEvents.length}；${down>up||negativeEvents.length>10?'风险偏高，控制集中度并核验事件影响':'未触发高风险阈值，但仍需关注数据源降级与盘中波动'}。`,evidence:[{breadth:metrics.breadth.status,up,down},{negativeEvents:negativeEvents.length}]}
  ];
  const conclusion=down>up||negativeEvents.length>10?'投委会结论：保持谨慎，优先控制仓位与集中度，不因单一涨幅追高。':'投委会结论：市场环境相对积极，但仅对证据完整标的继续深研，不作无依据推荐。';
  res.json({success:true,data:{summary,agents,auditedAgents:[auditedAgent],investmentCommittee:{conclusion,confidence:valid?Math.min(.85,.5+Math.abs(up-down)/Math.max(valid,1)):.3},finalConclusion:conclusion,metrics:{advance:up,decline:down,flat:metrics.breadth.flatCount||0,coverage:valid},evidence:{indexes:indexEvidence,breadth:{status:metrics.breadth.status,source:metrics.breadth.source,verifiedAgainst:metrics.breadth.verifiedAgainst,tradingDay:metrics.breadth.tradingDay},topIndustries:metrics.industries.slice(0,5)},risks:[disclosure]},meta:{mock:false,updatedAt:new Date()}});
} catch(error){next(error);} });

function scoreStock(stock) {
  const prices=[...stock.prices].reverse(),latest=prices.at(-1), closes=prices.map(x=>asNumber(x.close)).filter(Number.isFinite),f=stock.statements[0];
  const change20=closes.length>=21?(closes.at(-1)/closes.at(-21)-1)*100:null,change=asNumber(latest?.changePercent),roe=asNumber(f?.roe),pe=asNumber(latest?.pe),pb=asNumber(latest?.pb);
  const news=stock.news||[],keywordSentiment=title=>{const text=String(title||'').toLowerCase(),positive=['增长','增持','回购','中标','突破','创新高','profit','growth','buyback','upgrade'],negativeWords=['亏损','减持','处罚','调查','诉讼','下滑','风险','loss','probe','penalty','downgrade'];return positive.some(word=>text.includes(word))?0.35:negativeWords.some(word=>text.includes(word))?-0.35:0;},sentiments=news.map(x=>asNumber(x.sentiment)??keywordSentiment(x.title)),newsMean=sentiments.length?sentiments.reduce((a,b)=>a+b,0)/sentiments.length:null,negative=sentiments.filter(x=>x<-.2).length;
  const citations=[...prices.slice(-3).map(x=>({type:'market',title:`${stock.code} ${x.tradeDate.toISOString().slice(0,10)} 日线`,url:x.sourceUrl,source:x.source?.name,asOf:x.tradeDate,fetchedAt:x.fetchedAt,data:{close:asNumber(x.close),changePercent:asNumber(x.changePercent)}})),...(f?[{type:'fundamental',title:`${stock.code} ${f.periodEnd.toISOString().slice(0,10)} 财务数据`,url:f.sourceUrl,source:f.source?.name,asOf:f.periodEnd,fetchedAt:f.fetchedAt,data:{roe,netProfit:asNumber(f.netProfit),revenue:asNumber(f.revenue)}}]:[]),...news.slice(0,5).map(x=>({type:'news',title:x.title,url:x.url,source:x.source?.name,asOf:x.publishedAt,fetchedAt:x.fetchedAt,data:{sentiment:asNumber(x.sentiment)}}))];
  const revenue=asNumber(f?.revenue),netProfit=asNumber(f?.netProfit),operatingCashFlow=asNumber(f?.operatingCashFlow),profitMargin=revenue>0&&netProfit!=null?netProfit/revenue*100:null,ma=p=>closes.length>=p?closes.slice(-p).reduce((a,b)=>a+b,0)/p:null,ma5=ma(5),ma10=ma(10),ma20=ma(20),technicalScore=ma20==null?null:clamp(45+(latest&&asNumber(latest.close)>=ma20?12:-12)+(ma5>=ma10?10:-8)+(ma10>=ma20?10:-8)+(change20==null?0:Math.max(-15,Math.min(15,change20)))),marketScore=change20==null?null:clamp(50+change20*1.2+(change||0)*1.5),fundamentalScore=!f?null:clamp(roe!=null?50+roe*1.8+(pe>0&&pe<35?8:pe>80?-12:0)+(pb>0&&pb<4?5:0):45+(profitMargin==null?0:Math.max(-15,Math.min(25,profitMargin*.8)))+(operatingCashFlow>0?10:operatingCashFlow<0?-12:0)),sentimentProxy=newsMean==null&&change20!=null,newsScore=newsMean==null?(sentimentProxy?clamp(50+change20*.4+(change||0)*1.2):null):clamp(50+newsMean*35-negative*2);
  const volatility=closes.length>=20?Math.sqrt(closes.slice(-20).reduce((sum,x,i,arr)=>i?sum+Math.pow((x/arr[i-1]-1)*100,2):sum,0)/19):null,riskScore=volatility==null?null:clamp(75-volatility*5-negative*4-(Math.abs(change||0)>7?15:0));
  const researchInputs=[marketScore,fundamentalScore,newsScore,riskScore].filter(Number.isFinite),researchScore=researchInputs.length>=3?researchInputs.reduce((a,b)=>a+b,0)/researchInputs.length:null;
  const agents=[
    {agent:'technical-agent',score:technicalScore,view:technicalScore==null?'技术历史不足':`MA5 ${ma5.toFixed(2)}、MA10 ${ma10.toFixed(2)}、MA20 ${ma20.toFixed(2)}；20日收益 ${change20.toFixed(2)}%`},
    {agent:'market-agent',score:marketScore,view:marketScore==null?'市场行情历史不足':`20日相对动量 ${change20.toFixed(2)}%，最新日涨跌 ${change==null?'未知':change.toFixed(2)+'%'}`},
    {agent:'fundamentals-agent',score:fundamentalScore,view:fundamentalScore==null?'财务证据不足':roe!=null?`ROE ${roe.toFixed(2)}%，PE ${pe??'未知'}，PB ${pb??'未知'}`:`ROE 尚未入库；使用真实营收、净利润率 ${profitMargin==null?'未知':profitMargin.toFixed(2)+'%'} 与经营现金流 ${operatingCashFlow>0?'为正':operatingCashFlow<0?'为负':'未知'} 形成基本面代理评分`},
    {agent:'sentiment-agent',score:newsScore,view:newsScore==null?'无可审计情绪证据':sentimentProxy?`暂无足量个股新闻；以20日价格动量作为低置信情绪代理，不代表社交舆情`:`分析 ${news.length} 条真实公告/研报；缺少供应商情绪值时使用透明关键词规则，负面 ${negative} 条`},
    {agent:'risk-agent',score:riskScore,view:riskScore==null?'波动历史不足':`20日波动指标 ${volatility.toFixed(2)}，负面新闻 ${negative} 条`},
    {agent:'research-debate-agent',score:researchScore,view:researchScore==null?'不足三个角色形成有效观点，辩论不下结论':`综合市场、基本面、新闻与风险角色，形成审慎聚合观点`},
  ].map(agent=>({...agent,evidence:citations.filter(x=>['technical-agent','market-agent'].includes(agent.agent)?x.type==='market':agent.agent==='fundamentals-agent'?x.type==='fundamental':agent.agent==='sentiment-agent'?x.type==='news':true).slice(0,6)}));
  const scoreBreakdown={technical:technicalScore,sentiment:newsScore,market:marketScore,fundamental:fundamentalScore},available=Object.values(scoreBreakdown).filter(Number.isFinite),completeness=(Number.isFinite(technicalScore)+Number.isFinite(marketScore)+Number.isFinite(fundamentalScore)+(Number.isFinite(newsScore)?(sentimentProxy ? 0.5 : 1):0))/4,evidenceSufficient=available.length>=3&&closes.length>=20&&citations.length>=4;
  const totalScore=evidenceSufficient?weightedScore(scoreBreakdown):null;
  const recommendation=!evidenceSufficient?'insufficient-evidence':totalScore>=72?'research-candidate':totalScore>=58?'watch':'avoid-for-now';
  const reason=!evidenceSufficient?'行情、财务、新闻、风险四类证据中至少三类且20日行情是形成推荐的最低门槛；当前不足，不强推。':`多角色加权前均分 ${totalScore.toFixed(2)}，证据完整度 ${(completeness*100).toFixed(0)}%，${recommendation==='research-candidate'?'可进入人工深研，不等同买入建议':recommendation==='watch'?'分歧或优势有限，继续观察':'综合证据不支持列为优先候选'}。`;
  const asOf=citations.reduce((latest,x)=>!latest||new Date(x.asOf)>new Date(latest)?x.asOf:latest,null);
  const tradePlan=buildTradePlan(prices,totalScore??50,{evidenceSufficient}),finalDecision={action:tradePlan.status==='ready'?tradePlan.action:recommendation,label:decisionLabel(tradePlan.status==='ready'?tradePlan.action:recommendation),summary:reason},recommendationSummary=buildRecommendationSummary(scoreBreakdown,riskScore,tradePlan,{evidenceSufficient});
  return{code:stock.code,name:stock.name,industry:stock.industry?.name||null,totalScore:totalScore==null?null:Number(totalScore.toFixed(2)),recommendation,finalDecision,tradePlan,scoreBreakdown,recommendationSummary,reason,evidenceSufficient,evidenceCompleteness:Number(completeness.toFixed(2)),agents,evidence:citations,asOf,risks:[...recommendationSummary.risks,...(!evidenceSufficient?['证据不足，禁止方向性推荐。']:[]),disclosure]};
}

marketDashboardRouter.get('/market/recommendations/top10', async (_req,res,next)=>{try{
  if(!process.env.DATABASE_URL){const data=await scanLiveMarket();return res.json({success:true,data,meta:{source:data.source,status:data.status,mock:false,fetchedAt:new Date(),scannedAt:data.scannedAt,dataAsOf:data.dataAsOf,coverage:data.coverage,degradation:data.degradation}});}
  const stocks=await getPrisma().stock.findMany({where:{status:'listed',prices:{some:{interval:'1d'}}},include:{industry:true,prices:{where:{interval:'1d'},take:60,orderBy:{tradeDate:'desc'},include:{source:true}},statements:{take:4,orderBy:{periodEnd:'desc'},include:{source:true}},news:{take:20,orderBy:{publishedAt:'desc'},include:{source:true}}}});
  if(!stocks.length){const data=await scanLiveMarket();return res.json({success:true,data:{...data,stage:'数据库已连接但首轮证据入库尚未完成；暂用免费行情量价初筛'},meta:{source:`${data.source}（数据库冷启动回退）`,status:'degraded',mock:false,fetchedAt:new Date(),scannedAt:data.scannedAt,dataAsOf:data.dataAsOf,coverage:data.coverage,degradation:[...data.degradation,{stage:'database-evidence',reason:'数据库中尚无日线证据，完成首轮入库后自动升级'}]}});}
  const scored=stocks.map(scoreStock),eligible=scored.filter(x=>x.evidenceSufficient&&x.totalScore!=null).sort((a,b)=>b.totalScore-a.totalScore),items=eligible.slice(0,10);
  if(!items.length){const data=await scanLiveMarket();return res.json({success:true,data:{...data,stage:`数据库已入库 ${stocks.length} 只证券，但完整历史/财务/公告证据尚不足；暂用量价初筛`},meta:{source:`${data.source} + PostgreSQL冷启动证据`,status:'degraded',mock:false,fetchedAt:new Date(),scannedAt:data.scannedAt,dataAsOf:data.dataAsOf,coverage:data.coverage,degradation:[...data.degradation,{stage:'evidence-guard',reason:`${stocks.length} 只数据库候选尚无标的通过最低证据门槛`}]}});}
  res.json({success:true,data:{method:{id:'trading-agents-role-debate-v2',roles:['market-agent','fundamentals-agent','news-agent','risk-agent','research-debate-agent'],aggregation:'四个专业角色可用分数均值 × 证据完整度；研究/辩论角色复核观点',minimumEvidence:'至少3/4专业角色、20条日线、4条可引用证据；不足不进入Top10',candidateUniverse:'数据库 status=listed 且有真实日线'},items,coverage:{candidatesScored:stocks.length,evidenceEligible:eligible.length,returned:items.length,insufficientEvidence:scored.length-eligible.length},disclosure},meta:{source:'PostgreSQL audited market/financial/news data',status:items.length?'live':'insufficient-evidence',mock:false,fetchedAt:new Date(),dataAsOf:items.reduce((latest,x)=>!latest||new Date(x.asOf)>new Date(latest)?x.asOf:latest,null)}});
}catch(error){next(error);}});

function ema(values, period) { const k=2/(period+1); let x=values[0]; return values.map((v,i)=>x=i?v*k+x*(1-k):v); }
function signals(stock) {
  const rows=[...stock.prices].reverse(), closes=rows.map(x=>asNumber(x.close)), latest=rows.at(-1), out=[];
  const ch=asNumber(latest?.changePercent); if(ch>=3&&ch<=5)out.push({type:'up_3_5',evidence:{changePercent:ch,tradeDate:latest.tradeDate}});
  if(closes.length>=35){const fast=ema(closes,12),slow=ema(closes,26),dif=fast.map((v,i)=>v-slow[i]),dea=ema(dif,9),n=dif.length-1;if(dif[n]>dea[n]&&dif[n-1]<=dea[n-1])out.push({type:'macd_golden_cross',evidence:{dif:dif[n],dea:dea[n],previousDif:dif[n-1],previousDea:dea[n-1],parameters:'EMA(12,26,9)'}});}
  if(rows.length>=3){const last=rows.slice(-3),bull=last.every(x=>asNumber(x.close)>asNumber(x.open)); const rising=asNumber(last[1].close)>asNumber(last[0].close)&&asNumber(last[2].close)>asNumber(last[1].close); if(bull&&rising)out.push({type:'three_white_soldiers',aliases:['三红兵','三武士'],evidence:{dates:last.map(x=>x.tradeDate),opens:last.map(x=>asNumber(x.open)),closes:last.map(x=>asNumber(x.close)),definition:'连续三根阳线且收盘价逐日抬高'}});}
  return out.map(signal=>({...signal,code:stock.code,name:stock.name,latestTradeDate:latest?.tradeDate,source:latest?.source?.name}));
}

marketDashboardRouter.get('/market/scans/technical', async(req,res,next)=>{try{
  if(!process.env.DATABASE_URL)return res.json({success:true,data:{categories:{up3to5:[],macdGoldenCross:[],threeWhiteSoldiers:[]},coverage:{universe:'需连接数据库后扫描',listed:0,withDailyHistory:0,macdEligible:0,threeDayEligible:0,notCovered:0,note:'当前为无数据库预览模式'},definitions:{up3to5:'最新日涨幅闭区间[3%,5%]',macdGoldenCross:'当日DIF上穿DEA，EMA(12,26,9)',threeWhiteSoldiers:'连续三根阳线且收盘价逐日抬高'}},meta:{mock:false,status:'preview',updatedAt:new Date()}});
  const db=getPrisma(),limit=Math.min(100,Math.max(1,Number(req.query.limit)||30));
  const [listed,stocks]=await Promise.all([db.stock.count({where:{status:'listed'}}),db.stock.findMany({where:{status:'listed',prices:{some:{interval:'1d'}}},include:{prices:{where:{interval:'1d'},take:60,orderBy:{tradeDate:'desc'},include:{source:true}}}})]);
  const all=stocks.flatMap(signals), grouped={up3to5:all.filter(x=>x.type==='up_3_5').slice(0,limit),macdGoldenCross:all.filter(x=>x.type==='macd_golden_cross').slice(0,limit),threeWhiteSoldiers:all.filter(x=>x.type==='three_white_soldiers').slice(0,limit)};
  res.json({success:true,data:{categories:grouped,coverage:{universe:'PostgreSQL status=listed',listed,withDailyHistory:stocks.length,macdEligible:stocks.filter(x=>x.prices.length>=35).length,threeDayEligible:stocks.filter(x=>x.prices.length>=3).length,notCovered:listed-stocks.length,note:'仅扫描已入库真实日线；不以近似条件冒充MACD或K线形态。'},definitions:{up3to5:'最新日涨幅闭区间[3%,5%]',macdGoldenCross:'当日DIF上穿DEA，EMA(12,26,9)',threeWhiteSoldiers:'连续三根阳线且收盘价逐日抬高；三红兵/三武士按用户同义称呼归一'}},meta:{mock:false,updatedAt:new Date()}});
}catch(error){next(error);}});

marketDashboardRouter.post('/analysis/watchlist', async(req,res,next)=>{try{
  const codes=[...new Set((req.body?.codes||[]).map(x=>String(x).replace(/\D/g,'').padStart(6,'0')).filter(x=>/^\d{6}$/.test(x)))].slice(0,100);
  if(!codes.length)return res.status(400).json({success:false,error:{code:'CODES_REQUIRED',message:'codes[] is required'}});
  const stocks=await getPrisma().stock.findMany({where:{code:{in:codes}},include:{prices:{take:1,orderBy:{tradeDate:'desc'}},statements:{take:1,orderBy:{periodEnd:'desc'}},news:{take:20,orderBy:{publishedAt:'desc'}}}});
  res.json({success:true,data:{requested:codes.length,found:stocks.length,missing:codes.filter(c=>!stocks.some(s=>s.code===c)),items:stocks.map(stockResearch),disclosure},meta:{readOnly:true,schedulerSafe:true,mock:false,updatedAt:new Date()}});
}catch(error){next(error);}});

marketDashboardRouter.post('/analysis/portfolios', async(req,res,next)=>{try{
  const ids=[...new Set((req.body?.portfolioIds||[]).map(String))].slice(0,20); if(!ids.length)return res.status(400).json({success:false,error:{code:'PORTFOLIO_IDS_REQUIRED',message:'portfolioIds[] is required'}});
  const owner=ownerKey(req), results=[]; for(const id of ids){try{results.push({portfolioId:id,ok:true,analysis:await analyzePortfolio(id,owner)});}catch(error){results.push({portfolioId:id,ok:false,error:{code:error.code||'ANALYSIS_FAILED',message:error.message}});}}
  res.json({success:true,data:{results,disclosure},meta:{readOnly:true,schedulerSafe:true,mock:false,updatedAt:new Date()}});
}catch(error){next(error);}});
