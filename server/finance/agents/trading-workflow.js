import { getPrisma } from '../../research/prisma.js';
import { agents } from './production.js';
import { llmConfigured } from './llm-client.js';
import { runLlmTradingWorkflow } from './llm-workflow.js';
import { buildRecommendationSummary, buildTradePlan, decisionLabel, weightedScore } from '../trade-plan.js';

const VERSION = 'trading-debate-1.0.0';
const clamp = value => Math.max(0, Math.min(100, value));

function stance(score) {
  return score >= 67 ? 'bullish' : score <= 40 ? 'bearish' : 'neutral';
}

export async function runTradingWorkflow(code,{mode='auto'}={}) {
  const db = getPrisma();
  const stock = await db.stock.findUnique({
    where: { code },
    include: {
      prices: { take: 120, orderBy: { tradeDate: 'desc' } },
      statements: { take: 8, orderBy: { periodEnd: 'desc' } },
      news: { take: 30, orderBy: { publishedAt: 'desc' } },
    },
  });
  if (!stock) throw Object.assign(new Error(`Stock ${code} not found`), { status: 404, code: 'STOCK_NOT_FOUND' });
  if(mode==='llm'||(mode==='auto'&&llmConfigured()))return runLlmTradingWorkflow(stock);

  const research = agents.research(stock);
  const market = agents.market(stock);
  const risk = agents.risk(stock);
  const closes = stock.prices.map(item => Number(item.close)).filter(Number.isFinite).reverse();
  const return20 = closes.length > 1 ? (closes.at(-1) / closes[Math.max(0, closes.length - 21)] - 1) * 100 : null;
  const ma=p=>closes.length>=p?closes.slice(-p).reduce((a,b)=>a+b,0)/p:null,ma5=ma(5),ma10=ma(10),ma20=ma(20),latest=closes.at(-1),technicalScore=ma20==null?null:clamp(45+(latest>=ma20?15:-15)+(ma5>=ma10?10:-8)+(ma10>=ma20?10:-8)+Math.max(-12,Math.min(12,Number(return20||0))));
  const sentimentValues=stock.news.map(row=>/增长|回购|增持|中标|突破/.test(row.title)?1:/亏损|减持|处罚|调查|诉讼|下滑|风险/.test(row.title)?-1:0),sentimentScore=sentimentValues.length?clamp(50+sentimentValues.reduce((a,b)=>a+b,0)/sentimentValues.length*30):null;
  const fundamentalScore=stock.statements.length?research.score:null,marketScore=market.score,scoreBreakdown={technical:technicalScore,sentiment:sentimentScore,market:marketScore,fundamental:fundamentalScore},compositeScore=weightedScore(scoreBreakdown);
  const bullScore = clamp(research.score * 0.55 + market.score * 0.45 + Math.max(0, Number(return20 || 0)) * 1.5);
  const bearScore = clamp((100 - risk.score) * 0.65 + (100 - market.score) * 0.35 + Math.max(0, -Number(return20 || 0)) * 1.5);
  const debate = {
    bull: { stance: stance(bullScore), score: bullScore, argument: `基本面与市场证据的看多强度为 ${bullScore.toFixed(1)}。`, evidence: [...research.citations, ...market.citations].slice(0, 8) },
    bear: { stance: stance(100 - bearScore), score: bearScore, argument: `风险与反向市场证据的警戒强度为 ${bearScore.toFixed(1)}。`, evidence: risk.citations.slice(0, 8) },
  };
  const conviction = clamp(bullScore - bearScore + 50);
  const confidence = Math.min(0.92, 0.45 + Math.min(20, research.citations.length) * 0.02 + (closes.length >= 20 ? 0.08 : 0));
  const rawAction = conviction >= 70 ? 'consider-buy' : conviction <= 35 ? 'consider-reduce' : 'hold-and-observe';
  // Data-quality guard: a directional recommendation requires sufficient auditable evidence.
  const action = confidence < 0.6 || closes.length < 20 ? 'hold-and-observe' : rawAction;
  const tradePlan=buildTradePlan(stock.prices,compositeScore??conviction,{evidenceSufficient:confidence>=.6&&closes.length>=20});
  const resolvedAction=action==='consider-buy'&&tradePlan.status==='ready'?tradePlan.action:action;
  const recommendationSummary=buildRecommendationSummary(scoreBreakdown,risk.score,tradePlan,{evidenceSufficient:confidence>=.6&&closes.length>=20});

  return {
    workflow: 'TradingAgents-inspired evidence debate', version: VERSION, executionMode:'deterministic', configured:llmConfigured(), code, name: stock.name,
    asOf: new Date(), action:resolvedAction, conviction, confidence, return20,scoreBreakdown,compositeScore,tradePlan,recommendationSummary,
    finalDecision:{action:resolvedAction,label:decisionLabel(resolvedAction),summary:confidence < 0.6 || closes.length < 20?'证据不足，维持观察。':resolvedAction==='conditional-buy'?'趋势与多角色证据占优，仅在确认条件满足后考虑分批买入。':resolvedAction==='consider-reduce'?'风险证据占优，复核持仓并考虑按计划降低暴露。':'多空尚未形成足够优势，等待确认。'},
    analysts: { research, market, risk }, debate,
    investmentCommittee: {
      action:resolvedAction,
      summary: confidence < 0.6 || closes.length < 20 ? '可审计证据或历史行情不足，风控规则已阻止方向性建议。' : resolvedAction === 'conditional-buy' ? '多方证据占优，但必须等待价格与量能确认后再考虑分批配置。' : resolvedAction === 'consider-reduce' ? '风险证据占优，应复核仓位并考虑降低暴露。' : '多空证据未形成显著优势，建议继续观察并等待新证据。',
      conditions: ['核对最新公告与财务数据', '结合个人风险预算和持仓集中度', '价格数据可能存在交易所与供应商延迟'],
      disclosure: '该流程借鉴 TradingAgents 的角色分工与多空辩论思想，使用本平台真实数据和透明规则实现，不构成投资建议。',
    },
    trace: ['research-analyst', 'market-analyst', 'risk-analyst', 'bull-bear-debate', 'investment-committee'],
  };
}
