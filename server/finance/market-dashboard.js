import { Router } from 'express';
import { getPrisma } from '../research/prisma.js';
import { getMarketIndexes, getMarketBreadth } from '../market.js';
import { getIndustryRanking } from '../eastmoney.js';
import { marketAnalyst, stockResearch } from './agents/index.js';
import { analyzePortfolio, ownerKey } from './portfolio/service.js';

export const marketDashboardRouter = Router();
const asNumber = value => value == null ? null : Number(value);
const clamp = value => Math.max(0, Math.min(100, value));
const disclosure = '透明确定性规则，仅供研究；不预测收益、不构成投资建议。行情可能延迟，历史信号不代表未来表现。';

async function dashboardMetrics() {
  const [indexes, breadth, industries] = await Promise.all([
    getMarketIndexes(), getMarketBreadth(), getIndustryRanking().catch(() => []),
  ]);
  return { indexes, breadth, industries: industries.slice(0, 10) };
}

marketDashboardRouter.get('/market/dashboard', async (_req, res, next) => { try {
  const data = await dashboardMetrics();
  res.json({ success:true, data, meta:{ sources:['腾讯实时行情','Tushare上市全集（配置时）','东方财富行业'], mock:false, updatedAt:new Date(), breadthStatus:data.breadth.status } });
} catch (error) { next(error); } });

marketDashboardRouter.get('/market/ai-summary', async (_req, res, next) => { try {
  const db=getPrisma(), metrics=await dashboardMetrics();
  const indicators=await db.marketIndicator.findMany({take:100,orderBy:{observedAt:'desc'},include:{source:true}});
  const auditedAgent=marketAnalyst(indicators);
  const valid=metrics.breadth.totalCount||0, up=metrics.breadth.upCount||0, down=metrics.breadth.downCount||0;
  const indexEvidence=metrics.indexes.map(x=>({code:x.code,name:x.name,price:x.price,changePercent:x.change}));
  const summary=valid ? `沪深统计覆盖 ${valid} 只有效行情，上涨 ${up}、下跌 ${down}、平盘 ${metrics.breadth.flatCount||0}；市场广度${up>down?'偏强':up<down?'偏弱':'均衡'}。` : '实时市场广度不可用，不生成方向性结论。';
  res.json({success:true,data:{summary,metrics:{advance:up,decline:down,flat:metrics.breadth.flatCount||0,coverage:valid},auditedAgents:[auditedAgent],evidence:{indexes:indexEvidence,breadth:{status:metrics.breadth.status,source:metrics.breadth.source,verifiedAgainst:metrics.breadth.verifiedAgainst,tradingDay:metrics.breadth.tradingDay},topIndustries:metrics.industries.slice(0,5)},risks:[disclosure]},meta:{mock:false,updatedAt:new Date()}});
} catch(error){next(error);} });

function scoreStock(stock) {
  const p=stock.prices[0], f=stock.statements[0], change=asNumber(p?.changePercent), pe=asNumber(p?.pe), pb=asNumber(p?.pb), roe=asNumber(f?.roe);
  const components={
    momentum: change==null?null:clamp(50+change*5),
    valuation: pe==null&&pb==null?null:clamp(50+(pe>0&&pe<=30?15:pe>80?-20:0)+(pb>0&&pb<=3?10:pb>8?-10:0)),
    quality: roe==null?null:clamp(50+roe*2),
    liquidity: asNumber(p?.turnover)==null?null:clamp(40+Math.log10(Math.max(1,asNumber(p.turnover)))*7),
  };
  const available=Object.entries(components).filter(([,v])=>v!=null), completeness=available.length/4;
  // Missing evidence is conservative rather than silently excluded; extreme one-day moves are penalized.
  const filled=Object.values(components).map(value=>value==null?35:value);
  let score=available.length ? filled.reduce((sum,value)=>sum+value,0)/filled.length*completeness : null;
  if(score!=null&&change!=null&&Math.abs(change)>7)score=Math.max(0,score-15);
  const evidence=[{metric:'changePercent',value:change,asOf:p?.tradeDate,source:p?.source?.name},{metric:'pe',value:pe,asOf:p?.tradeDate,source:p?.source?.name},{metric:'pb',value:pb,asOf:p?.tradeDate,source:p?.source?.name},{metric:'roe',value:roe,asOf:f?.periodEnd,source:f?.source?.name}];
  const risks=['评分只使用数据库中可审计字段，缺失维度不参与平均。']; if(change!=null&&Math.abs(change)>7)risks.push('当日波动超过7%，短线风险较高。'); if(pe!=null&&pe>80)risks.push('市盈率高于80，估值回撤风险较高。'); risks.push(disclosure);
  return {code:stock.code,name:stock.name,industry:stock.industry?.name||null,score:score==null?null:Number(score.toFixed(2)),evidenceCompleteness:Number(completeness.toFixed(2)),components,evidence,risks};
}

marketDashboardRouter.get('/market/recommendations/top10', async (_req,res,next)=>{try{
  const stocks=await getPrisma().stock.findMany({where:{status:'listed',prices:{some:{interval:'1d'}}},include:{industry:true,prices:{where:{interval:'1d'},take:1,orderBy:{tradeDate:'desc'},include:{source:true}},statements:{take:1,orderBy:{periodEnd:'desc'},include:{source:true}}}});
  const ranked=stocks.map(scoreStock).filter(x=>x.score!=null).sort((a,b)=>b.score-a.score).slice(0,10);
  res.json({success:true,data:{method:{id:'transparent-equal-available-v1',formula:'可用维度等权平均：动量、估值、质量、流动性；每维0-100',candidateUniverse:'数据库 status=listed 且至少有一条日线的股票',candidatesScored:stocks.length},items:ranked,disclosure},meta:{source:'PostgreSQL audited market/financial data',mock:false,updatedAt:new Date()}});
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
