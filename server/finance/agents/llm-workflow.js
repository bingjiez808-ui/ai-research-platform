import { callFinanceAgent, llmConfigured } from './llm-client.js';

const num=value=>value==null?null:Number(value);
const evidenceFor=stock=>[
  ...(stock.prices||[]).slice(0,60).map(row=>({id:`price:${row.id}`,type:'price',asOf:row.tradeDate,open:num(row.open),high:num(row.high),low:num(row.low),close:num(row.close),changePercent:num(row.changePercent),turnover:num(row.turnover)})),
  ...(stock.statements||[]).slice(0,8).map(row=>({id:`financial:${row.id}`,type:'financial',asOf:row.periodEnd,revenue:num(row.revenue),netProfit:num(row.netProfit),roe:num(row.roe),grossMargin:num(row.grossMargin),sourceUrl:row.sourceUrl})),
  ...(stock.news||[]).slice(0,20).map(row=>({id:`news:${row.id}`,type:'news',asOf:row.publishedAt,title:row.title,summary:row.summary,url:row.url})),
];
const validCitations=(result,ids)=>[...new Set(result.evidenceIds||[])].filter(id=>ids.has(id));

export async function runLlmTradingWorkflow(stock,{call=callFinanceAgent}={}){
  if(!llmConfigured())throw Object.assign(new Error('LLM workflow is not configured'),{status:503,code:'LLM_NOT_CONFIGURED'});
  const evidence=evidenceFor(stock),ids=new Set(evidence.map(x=>x.id));
  const groups={market:evidence.filter(x=>x.type==='price'),fundamental:evidence.filter(x=>x.type==='financial'),news:evidence.filter(x=>x.type==='news')};
  const [market,fundamental,news]=await Promise.all([
    call({role:'市场技术分析师',instruction:'评估趋势、量价、波动与技术失效条件。',evidence:groups.market}),
    call({role:'基本面分析师',instruction:'评估盈利质量、估值所需证据和基本面风险。',evidence:groups.fundamental}),
    call({role:'新闻公告分析师',instruction:'评估公告催化、情绪与事件风险，区分事实和推断。',evidence:groups.news}),
  ]);
  const analystViews={market,fundamental,news};
  const debateEvidence=[...evidence,{id:'view:market',type:'agent-view',value:market},{id:'view:fundamental',type:'agent-view',value:fundamental},{id:'view:news',type:'agent-view',value:news}];
  const [bull,bear]=await Promise.all([
    call({role:'多头研究员',instruction:'提出最强看多论据，同时说明论据何时失效。不得忽略负面证据。',evidence:debateEvidence}),
    call({role:'空头研究员',instruction:'提出最强看空论据、尾部风险和反证条件。不得忽略正面证据。',evidence:debateEvidence}),
  ]);
  const committeeEvidence=[...debateEvidence,{id:'view:bull',type:'agent-view',value:bull},{id:'view:bear',type:'agent-view',value:bear}];
  const risk=await call({role:'风险经理',instruction:'从仓位、波动、事件、流动性和证据缺口审查交易提案；证据不足时否决方向性建议。',evidence:committeeEvidence});
  const portfolio=await call({role:'投资组合经理',instruction:'综合所有角色，输出 action=research-candidate|watch|avoid|insufficient-evidence、仓位上限、持有周期、入场条件、失效条件；不得承诺收益。',evidence:[...committeeEvidence,{id:'view:risk',type:'agent-view',value:risk}]});
  const historyCount=groups.market.length,hasFundamental=groups.fundamental.length>0,hasNews=groups.news.length>0,cited=validCitations(portfolio,ids),guardPassed=historyCount>=20&&hasFundamental&&hasNews&&cited.length>=2&&Number(portfolio.confidence||0)>=.6;
  const action=guardPassed?(portfolio.action||portfolio.stance||'watch'):'insufficient-evidence';
  return {workflow:'TradingAgents LLM evidence workflow',version:'llm-debate-1.0.0',executionMode:'llm',configured:true,code:stock.code,name:stock.name,asOf:new Date(),action,confidence:Number(portfolio.confidence||0),evidenceCoverage:{historyCount,financialCount:groups.fundamental.length,newsCount:groups.news.length,citations:cited.length,guardPassed},analysts:analystViews,debate:{bull,bear},risk,portfolioManager:{...portfolio,action},trace:['market-analyst','fundamentals-analyst','news-analyst','bull-researcher','bear-researcher','risk-manager','portfolio-manager','deterministic-evidence-guard'],disclosure:'由配置的外部大模型基于已入库证据真实运行；模型可能出错，不构成投资建议。'};
}
