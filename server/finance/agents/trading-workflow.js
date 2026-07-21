import { getPrisma } from '../../research/prisma.js';
import { agents } from './production.js';
import { llmConfigured } from './llm-client.js';
import { runLlmTradingWorkflow } from './llm-workflow.js';

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

  return {
    workflow: 'TradingAgents-inspired evidence debate', version: VERSION, executionMode:'deterministic', configured:llmConfigured(), code, name: stock.name,
    asOf: new Date(), action, conviction, confidence, return20,
    analysts: { research, market, risk }, debate,
    investmentCommittee: {
      action,
      summary: confidence < 0.6 || closes.length < 20 ? '可审计证据或历史行情不足，风控规则已阻止方向性建议。' : action === 'consider-buy' ? '多方证据占优，可在风险预算内进一步研究分批配置。' : action === 'consider-reduce' ? '风险证据占优，应复核仓位并考虑降低暴露。' : '多空证据未形成显著优势，建议继续观察并等待新证据。',
      conditions: ['核对最新公告与财务数据', '结合个人风险预算和持仓集中度', '价格数据可能存在交易所与供应商延迟'],
      disclosure: '该流程借鉴 TradingAgents 的角色分工与多空辩论思想，使用本平台真实数据和透明规则实现，不构成投资建议。',
    },
    trace: ['research-analyst', 'market-analyst', 'risk-analyst', 'bull-bear-debate', 'investment-committee'],
  };
}
