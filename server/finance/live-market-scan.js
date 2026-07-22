import { fetchFullMarketSnapshot } from './adapters/eastmoney.js';
import { getAllMarketQuotes, getHotStockQuotes } from '../market.js';

const disclosure = '免费公开行情近实时初筛，仅供研究；没有财务、公告与历史证据时不构成投资建议。';
const number = value => value == null || value === '-' ? null : Number(value);
const clamp = value => Math.max(0, Math.min(100, value));

function normalizeEastmoney(row) {
  return { code: String(row.f12), name: String(row.f14), price: number(row.f2), change: number(row.f3), volume: number(row.f5), turnover: number(row.f6), amplitude: number(row.f7), turnoverRate: number(row.f8), pe: number(row.f9), marketCap: number(row.f20), circCap: number(row.f21), pb: number(row.f23), timestamp: number(row.f124), source: '东方财富全市场快照' };
}
function normalizeTencent(row) { return { ...row, source: row.source || '腾讯重点行情故障回退', timestamp: null }; }

export function scoreLiveCandidate(stock) {
  const change = number(stock.change) || 0, amount = number(stock.turnover) || 0, turnoverRate = number(stock.turnoverRate), pe = number(stock.pe), pb = number(stock.pb), amplitude = number(stock.amplitude);
  const liquidity = clamp(35 + Math.max(0, Math.log10(Math.max(amount, 1)) - 7) * 14);
  const momentum = clamp(50 + Math.max(-6, Math.min(6, change)) * 4);
  const valuation = pe > 0 && pe <= 45 ? 68 : pe > 0 && pe <= 80 ? 52 : 42;
  const quality = pb > 0 && pb <= 8 ? 60 : 45;
  const risk = clamp(78 - Math.max(0, (amplitude || Math.abs(change)) - 3) * 5 - Math.max(0, Math.abs(change) - 7) * 8);
  const score = clamp(.32 * liquidity + .24 * momentum + .16 * valuation + .08 * quality + .2 * risk);
  const asOf = stock.timestamp ? new Date(stock.timestamp * 1000).toISOString() : new Date().toISOString();
  return { ...stock, totalScore: Number(score.toFixed(2)), recommendation: 'market-screen-candidate', reason: `近实时量价初筛：涨跌 ${change.toFixed(2)}%，成交额 ${(amount / 1e8).toFixed(2)} 亿元；尚需历史、财务和公告 Agent 复核。`, evidenceSufficient: false, evidenceCompleteness: .25, asOf, agents: [{ agent: 'market-agent', score: Number(((liquidity + momentum) / 2).toFixed(2)), view: `流动性 ${liquidity.toFixed(1)}，当日动量 ${momentum.toFixed(1)}` }, { agent: 'risk-agent', score: Number(risk.toFixed(2)), view: `振幅 ${amplitude == null ? '未知' : amplitude.toFixed(2) + '%'}；未完成公告事件核验` }], evidence: [{ type: 'market-snapshot', title: `${stock.code} ${stock.name} 近实时行情`, source: stock.source, asOf, data: { price: stock.price, changePercent: change, turnover: amount, turnoverRate, pe, pb, marketCap: stock.marketCap } }], risks: ['仅通过量价流动性初筛，不能替代完整多 Agent 研究。', disclosure] };
}

const eligible = stock => stock && stock.price > 0 && !/ST|退/.test(stock.name) && Number(stock.turnover || 0) >= 5e7 && Number(stock.marketCap || 0) >= 2e9 && Number(stock.change || 0) > -9.5 && Number(stock.change || 0) < 9.5;

export async function scanLiveMarket() {
  let rows, source, status = 'live', degradation = [];
  try { rows = (await fetchFullMarketSnapshot()).map(normalizeEastmoney); source = '东方财富全市场快照'; }
  catch (error) {
    const fullFallback=await getAllMarketQuotes();
    rows=(fullFallback.length>=1000?fullFallback:await getHotStockQuotes()).map(normalizeTencent);
    source=fullFallback.length>=1000?'腾讯全市场代码枚举':'腾讯重点行情';status='degraded';
    degradation.push({ provider: 'eastmoney', fallback: source, reason: error.message });
  }
  const candidates = rows.filter(eligible).map(scoreLiveCandidate).sort((a, b) => b.totalScore - a.totalScore);
  const isFullMarket = rows.length >= 4000;
  return { items: candidates.slice(0, 10), coverage: { status: isFullMarket ? 'full' : 'partial', isFullMarket, totalListed: rows.length, scannedCount: rows.length, candidateCount: candidates.length, coverageRatio: isFullMarket ? 1 : null }, stage: '免费行情量价初筛完成，等待历史/财务/公告深度复核', method: { id: 'free-market-funnel-v1', stages: ['东方财富全市场快照', '流动性与异常行情过滤', '量价/估值/风险透明评分', '腾讯重点行情复核', '历史/财务/公告待补全'] }, source, status, degradation, scannedAt: new Date().toISOString(), dataAsOf: candidates[0]?.asOf || null, disclosure };
}
