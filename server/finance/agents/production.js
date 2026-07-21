import { getPrisma } from '../../research/prisma.js';

const AGENT_VERSION = 'production-rules-1.0.0';
const citationsFor = stock => [
  ...(stock.prices?.slice(0, 3).map(p => ({ sourceType: 'stock_price', sourceId: String(p.id), title: `${stock.code} ${p.tradeDate.toISOString().slice(0,10)} 行情`, url: p.sourceUrl, quotedData: { close: String(p.close), changePercent: p.changePercent && String(p.changePercent), fetchedAt: p.fetchedAt } })) || []),
  ...(stock.statements?.slice(0, 2).map(f => ({ sourceType: 'financial_statement', sourceId: String(f.id), title: `${stock.code} ${f.periodEnd.toISOString().slice(0,10)} 财务指标`, url: f.sourceUrl, quotedData: { revenue: f.revenue && String(f.revenue), netProfit: f.netProfit && String(f.netProfit), roe: f.roe && String(f.roe) } })) || []),
  ...(stock.news?.slice(0, 5).map(n => ({ sourceType: 'news_article', sourceId: String(n.id), title: n.title, url: n.url, quotedData: { publishedAt: n.publishedAt, sentiment: n.sentiment && String(n.sentiment) } })) || []),
];
const base = (agent, summary, score, signal, trace, citations, risks) => ({ agent, method: 'deterministic-evidence-rules', version: AGENT_VERSION, summary, score, signal, trace, citations, risks, confidence: Math.min(0.95, 0.45 + citations.length * 0.05), model: null, inputTokens: 0, outputTokens: 0, costUsd: 0 });

export const agents = {
  research(stock) { const p=stock.prices?.[0], f=stock.statements?.[0]; let score=50; const trace=[]; if(p){const c=Number(p.changePercent||0);score+=Math.max(-15,Math.min(15,c*2));trace.push({step:'price-momentum',input:c,delta:Math.max(-15,Math.min(15,c*2))});} if(f){const roe=Number(f.roe||0);score+=Math.max(-15,Math.min(20,roe/2));trace.push({step:'fundamentals',roe,netProfit:f.netProfit&&String(f.netProfit)});} score=Math.max(0,Math.min(100,score)); return base('research-agent',`${stock.name}（${stock.code}）证据规则评分 ${score.toFixed(1)}。`,score,score>=70?'positive':score<40?'cautious':'neutral',trace,citationsFor(stock),['历史数据不代表未来表现。','数据源可能存在延迟。']); },
  market(stock) { const p=stock.prices?.[0]; const change=Number(p?.changePercent||0); const score=Math.max(0,Math.min(100,50+change*5)); return base('market-agent',`${stock.name} 最新涨跌幅 ${change.toFixed(2)}%，市场信号 ${score>=65?'risk-on':score<35?'risk-off':'neutral'}。`,score,score>=65?'risk-on':score<35?'risk-off':'neutral',[{step:'latest-return',changePercent:change}],citationsFor(stock),['单日行情信号不能替代完整市场判断。']); },
  risk(stock) { const f=stock.statements?.[0]; const negative=stock.news?.filter(n=>Number(n.sentiment||0)<0).length||0; const debt=f?.totalAssets?Number(f.totalLiabilities||0)/Number(f.totalAssets):null; let risk=25+negative*8+(debt==null?15:Math.max(0,(debt-.5)*60)); risk=Math.max(0,Math.min(100,risk)); return base('risk-agent',`${stock.name} 风险分 ${risk.toFixed(1)}，负面事件 ${negative} 条${debt==null?'，资产负债率数据不足':`，资产负债率 ${(debt*100).toFixed(1)}%`}。`,100-risk,risk>65?'high-risk':risk>40?'watch':'controlled',[{step:'negative-news',count:negative},{step:'leverage',debtRatio:debt}],citationsFor(stock),['风险模型为规则模型，不能覆盖所有尾部事件。']); },
};

export async function runProductionAgent(agentName, code) {
  const db=getPrisma(); const fn=agents[agentName]; if(!fn) throw Object.assign(new Error(`Unknown agent: ${agentName}`),{status:404,code:'AGENT_NOT_FOUND'});
  const stock=await db.stock.findUnique({where:{code},include:{prices:{take:5,orderBy:{tradeDate:'desc'}},statements:{take:4,orderBy:{periodEnd:'desc'}},news:{take:20,orderBy:{publishedAt:'desc'}}}}); if(!stock) throw Object.assign(new Error(`Stock ${code} not found`),{status:404,code:'STOCK_NOT_FOUND'});
  const result=fn(stock);
  const analysis=await db.aIAnalysis.create({
    data:{stockId:stock.id,agent:result.agent,method:result.method,version:result.version,asOf:new Date(),score:result.score,signal:result.signal,summary:result.summary,evidence:result.citations.map(c=>c.quotedData),risks:result.risks,trace:result.trace,confidence:result.confidence,model:result.model,inputTokens:result.inputTokens,outputTokens:result.outputTokens,costUsd:result.costUsd,citations:{create:result.citations}},
    include:{citations:true},
  });
  return analysis;
}
