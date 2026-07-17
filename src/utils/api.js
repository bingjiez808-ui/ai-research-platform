// 前端 API 层 — 双模数据策略
// 1. 优先调用后端 Express API 获取实时数据
// 2. 后端不可用时自动降级到模拟数据（演示模式）
import {
  stocks, hotSectors, marketData, riskAlerts, watchlistDefault,
  portfolioData, dailyReports, agentResponses,
  gainStocks3to5, macdGoldenCrossStocks,
  threeRedSoldiersStocks, threeSamuraisStocks,
  morningAnalysis, afternoonScan,
} from '../data/mockData.js';

const BASE = '/api';

// 全局状态：是否处于实时数据模式
let liveModeActive = false;
let listeners = [];
export function onApiModeChange(fn) { listeners.push(fn); return () => listeners = listeners.filter(l => l !== fn); }
function setLiveMode(v) { liveModeActive = v; listeners.forEach(fn => fn(v)); }
export function isLiveMode() { return liveModeActive; }

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`请求失败(${res.status})`);
  const json = await res.json();
  if (!json.success) throw new Error(json.message || '服务异常');
  return json.data;
}

// 包装：先尝试 API，失败则降级
async function withFallback(fn, fallbackData) {
  try {
    const data = await fn();
    if (data) {
      setLiveMode(true);
      return data;
    }
  } catch (e) {
    console.log('API 不可用，使用演示数据', e.message);
  }
  setLiveMode(false);
  return fallbackData;
}

// ==================== 市场 ====================

export async function getMarketOverview() {
  return withFallback(
    () => apiFetch(`${BASE}/market/overview`),
    marketData
  );
}

export async function getHotIndustries() {
  return withFallback(
    () => apiFetch(`${BASE}/market/hot-industries`),
    { industries: hotSectors, concepts: [] }
  );
}

// ==================== 股票推荐 ====================

export async function getStockRecommendations() {
  return withFallback(
    () => apiFetch(`${BASE}/stocks/recommend`),
    stocks.slice(0, 10).map(s => {
      const scores = {
        fundamental: s.pe < 20 ? 85 : s.pe < 40 ? 70 : 55,
        technical: s.macd === '金叉' ? 80 : s.macd === '多头' ? 75 : 50,
        capital: s.mainFlow?.includes('流入') ? 80 : 50,
        industry: s.sectorGrowth?.includes('高速') ? 85 : s.sectorGrowth?.includes('景气') ? 75 : 60,
        sentiment: s.change > 0 ? 70 : 50,
        risk: s.volatility === '低' ? 85 : s.volatility === '中' ? 65 : 50,
      };
      scores.composite = Math.round(
        scores.fundamental * 0.30 + scores.technical * 0.15 +
        scores.capital * 0.20 + scores.industry * 0.15 +
        scores.sentiment * 0.10 + scores.risk * 0.10
      );
      return { ...s, scores };
    })
  );
}

// ==================== 股票详情 ====================

export async function getStockDetail(code) {
  return withFallback(
    () => apiFetch(`${BASE}/stocks/detail?code=${code}`),
    (() => {
      const s = stocks.find(s => s.code === code) || stocks[0];
      const scores = {
        fundamental: s.pe < 20 ? 85 : s.pe < 40 ? 70 : 55,
        technical: s.macd === '金叉' ? 80 : s.macd === '多头' ? 75 : 50,
        capital: s.mainFlow?.includes('流入') ? 80 : 50,
        industry: s.sectorGrowth?.includes('高速') ? 85 : s.sectorGrowth?.includes('景气') ? 75 : 60,
        sentiment: s.change > 0 ? 70 : 50,
        risk: s.volatility === '低' ? 85 : s.volatility === '中' ? 65 : 50,
      };
      scores.composite = Math.round(
        scores.fundamental * 0.30 + scores.technical * 0.15 +
        scores.capital * 0.20 + scores.industry * 0.15 +
        scores.sentiment * 0.10 + scores.risk * 0.10
      );
      return {
        ...s,
        price: s.price,
        change: s.change,
        changeAmount: s.change,
        open: s.price - s.change,
        high: s.price + s.change * 0.5,
        low: s.price - s.change * 0.5,
        volume: s.volume,
        turnover: s.volume * s.price,
        marketCap: s.marketCap,
        circCap: s.marketCap,
        pe: s.pe,
        pb: s.pb,
        turnoverRate: (s.volume / 1e8 * s.price / 100).toFixed(2),
        amplitude: Math.abs(s.change / s.price * 100).toFixed(1),
        fundFlow: {
          mainNetInflow: s.mainFlow?.includes('流入') ? 1.8e8 : -0.5e8,
          superLargeNetInflow: 0.8e8,
          largeNetInflow: 1.0e8,
        },
        notices: [
          { title: `${s.name}近期公告`, date: '2026-07-15', url: '#' },
        ],
        scores,
        analysis: {
          conclusion: scores.composite >= 85
            ? '整体评分优秀，适合中长期配置，建议分批买入。'
            : scores.composite >= 70
            ? '综合表现良好，可作为卫星配置，建议分步建仓。'
            : '当前处于合理区间，建议观望等待更好时机。',
          reasons: [
            s.pe < 20 ? '当前估值处于历史较低水平' : `PE ${s.pe}，估值合理`,
            s.change > 0 ? '今日小幅上涨，走势平稳' : '今日小幅回调，属正常波动',
            s.sectorGrowth || '行业景气度良好',
            s.mainFlow?.includes('流入') ? '资金面偏多，市场关注度高' : null,
            s.macd === '金叉' || s.macd === '多头' ? '技术走势健康' : null,
          ].filter(Boolean).slice(0, 5),
          risks: [
            Math.abs(s.change) > 3 ? '短期波动较大' : null,
            s.pe > 50 ? '估值偏高，存在估值回归风险' : null,
            s.volatility === '高' ? '股价波动较大，需控制仓位' : null,
            '任何投资都有风险，市场存在不确定因素',
          ].filter(Boolean).slice(0, 5),
          suggestion: scores.composite >= 85
            ? '建议：可考虑首次建仓30%，回调3-5%时加仓。以上为AI分析，不构成投资建议。'
            : '建议：先建10-20%观察仓，确认趋势后逐步加仓。以上为AI分析，不构成投资建议。',
          confidence: Math.min(5, Math.ceil(scores.composite / 20)),
        },
      };
    })()
  );
}

// ==================== 搜索 ====================

export async function searchStocks(keyword) {
  return withFallback(
    () => apiFetch(`${BASE}/stocks/search?keyword=${encodeURIComponent(keyword)}`),
    stocks
      .filter(s => s.name.includes(keyword) || s.code.includes(keyword))
      .map(s => ({ code: s.code, name: s.name, market: s.code.startsWith('6') ? '上证A' : '深证A' }))
  );
}

// ==================== 股票列表 ====================

export async function getStockList({ sort = 'f3', order = 'desc', page = 1, size = 20 } = {}) {
  return withFallback(
    () => apiFetch(`${BASE}/stocks/list?sort=${sort}&order=${order}&page=${page}&size=${size}`),
    { total: stocks.length, list: stocks }
  );
}

// ==================== 扫描 ====================

export async function getFullScan() {
  return withFallback(
    () => apiFetch(`${BASE}/scan/full`),
    {
      categories: {
        up35: { label: '涨幅3-5%', list: gainStocks3to5 },
        macdGoldenCross: { label: 'MACD金叉', list: macdGoldenCrossStocks },
        threeRedSoldiers: { label: '三红兵', list: threeRedSoldiersStocks },
        threeSamurai: { label: '三武士', list: threeSamuraisStocks },
      },
      top5: [
        { name: '汇川技术', code: '300124', scanType: '三红兵', score: 93, change: 3.55, reason: '机器人龙头三连阳突破' },
        { name: '工业富联', code: '601138', scanType: '三红兵', score: 92, change: 3.83, reason: 'AI服务器三连阳' },
        { name: '新易盛', code: '300502', scanType: '涨幅4.77%', score: 90, change: 4.77, reason: 'CPO需求持续超预期' },
        { name: '阳光电源', code: '300274', scanType: '涨幅4.13%', score: 89, change: 4.13, reason: '储能逆变器全球龙头' },
        { name: '北方华创', code: '002371', scanType: '三武士', score: 88, change: 3.97, reason: '半导体设备国产替代' },
      ],
      totalFound: 339,
    }
  );
}

// ==================== 持仓 ====================

export async function analyzePortfolio(stocks) {
  return withFallback(
    () => apiFetch(`${BASE}/portfolio/analyze`, {
      method: 'POST',
      body: JSON.stringify({ stocks }),
    }),
    portfolioData
  );
}

// ==================== AI 日报 ====================

export async function getDailyReport(type) {
  return withFallback(
    () => apiFetch(`${BASE}/daily/${type}`),
    dailyReports[type] || dailyReports.morning
  );
}

// ==================== 定时Agent ====================

export async function getMorningAnalysis() {
  return withFallback(
    () => apiFetch(`${BASE}/agent/morning`),
    morningAnalysis
  );
}

export async function getAfternoonScan() {
  return withFallback(
    () => apiFetch(`${BASE}/agent/afternoon`),
    afternoonScan
  );
}

// ==================== AI Agent 对话 ====================

export async function getAgentResponse(query) {
  const normalized = query.trim();
  const matchedKey = Object.keys(agentResponses).find(
    key => normalized.includes(key) || key.includes(normalized)
  );

  if (matchedKey) {
    return { ...agentResponses[matchedKey], liveMode: false };
  }

  // 尝试搜索股票
  const stocks = await searchStocks(normalized);
  if (stocks.length > 0) {
    const detail = await getStockDetail(stocks[0].code);
    return {
      conclusion: detail.analysis?.conclusion || '分析完成',
      reasons: detail.analysis?.reasons || [],
      risks: detail.analysis?.risks || [],
      suggestion: detail.analysis?.suggestion || '请根据自身情况决策',
      confidence: detail.analysis?.confidence || 3,
      aiScore: detail.scores?.composite || 60,
      liveMode: detail.liveMode || false,
    };
  }

  return agentResponses.default;
}

// ==================== 风险提示 ====================

export async function getRiskAlerts() {
  return withFallback(
    () => apiFetch(`${BASE}/market/risks`),
    riskAlerts
  );
}

// ==================== 自选股 ====================

export function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem('watchlist') || '[]');
  } catch { return []; }
}

export function saveWatchlist(list) {
  localStorage.setItem('watchlist', JSON.stringify(list));
}
