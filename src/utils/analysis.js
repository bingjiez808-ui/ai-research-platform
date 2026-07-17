// ============================================================
// AI 投研平台 - 六维分析引擎
// ============================================================
import { stocks } from '../data/mockData';

// 六维评分计算
export function calculateSixDimensionScore(stock) {
  const fundamental = calculateFundamentalScore(stock);
  const technical = calculateTechnicalScore(stock);
  const fundFlow = calculateFundFlowScore(stock);
  const sector = calculateSectorScore(stock);
  const sentiment = calculateSentimentScore(stock);
  const risk = calculateRiskScore(stock);

  const composite = Math.round(
    fundamental * 0.25 + technical * 0.15 + fundFlow * 0.2 + sector * 0.15 + sentiment * 0.1 + risk * 0.15
  );

  return {
    composite,
    fundamental,
    technical,
    fundFlow,
    sector,
    sentiment,
    risk,
  };
}

function calculateFundamentalScore(stock) {
  let score = 50;
  if (stock.pe > 0 && stock.pe < 15) score += 15;
  else if (stock.pe < 25) score += 10;
  else if (stock.pe < 35) score += 5;

  if (stock.roe > 25) score += 15;
  else if (stock.roe > 15) score += 10;
  else if (stock.roe > 10) score += 5;

  if (stock.profitGrowth > 25) score += 10;
  else if (stock.profitGrowth > 15) score += 7;
  else if (stock.profitGrowth > 5) score += 3;

  if (stock.debtRatio < 30) score += 10;
  else if (stock.debtRatio < 50) score += 5;

  return Math.min(100, score);
}

function calculateTechnicalScore(stock) {
  let score = 50;
  if (stock.macd === '金叉') score += 15;
  else if (stock.macd === '多头') score += 10;

  if (stock.rsi >= 50 && stock.rsi <= 70) score += 10;
  else if (stock.rsi >= 40 && stock.rsi < 50) score += 5;

  if (stock.kdj === '金叉' || stock.kdj === '多头') score += 10;

  if (stock.trend === '上升') score += 15;
  else if (stock.trend === '横盘') score += 5;

  return Math.min(100, score);
}

function calculateFundFlowScore(stock) {
  let score = 50;
  if (stock.northFlow.includes('净流入')) {
    const amount = parseFloat(stock.northFlow.match(/[\d.]+/)?.[0] || 0);
    if (amount > 3) score += 20;
    else if (amount > 1) score += 10;
    else score += 5;
  } else {
    score -= 10;
  }

  if (stock.mainFlow.includes('净流入')) {
    const amount = parseFloat(stock.mainFlow.match(/[\d.]+/)?.[0] || 0);
    if (amount > 2) score += 15;
    else if (amount > 0.5) score += 8;
  } else {
    score -= 5;
  }

  const instHolding = parseFloat(stock.institutionHolding);
  if (instHolding > 60) score += 10;
  else if (instHolding > 40) score += 5;

  return Math.min(100, Math.max(0, score));
}

function calculateSectorScore(stock) {
  let score = 50;
  if (stock.sectorRank === 1) score += 20;
  else if (stock.sectorRank === 2) score += 10;

  if (stock.sectorGrowth.includes('高速') || stock.sectorGrowth.includes('景气')) score += 15;
  else if (stock.sectorGrowth.includes('稳健') || stock.sectorGrowth.includes('稳定')) score += 8;

  if (stock.policySupport.includes('强') || stock.policySupport.includes('扶持')) score += 10;
  else if (stock.policySupport.includes('中')) score += 5;

  return Math.min(100, score);
}

function calculateSentimentScore(stock) {
  // 基于涨跌幅、成交量等计算市场情绪
  let score = 50;
  if (stock.changePercent > 1) score += 15;
  else if (stock.changePercent > 0) score += 8;
  else if (stock.changePercent < -2) score -= 10;

  if (stock.volume > 10000000) score += 10;
  else if (stock.volume > 5000000) score += 5;

  return Math.min(100, Math.max(0, score));
}

function calculateRiskScore(stock) {
  // 风险评分：分数越高 = 风险越低
  let score = 50;
  if (stock.volatility === '低') score += 20;
  else if (stock.volatility === '中') score += 10;

  const maxDd = parseFloat(stock.maxDrawdown);
  if (maxDd > -15) score += 15;
  else if (maxDd > -25) score += 8;

  if (stock.liquidityRisk === '极低' || stock.liquidityRisk === '低') score += 10;

  return Math.min(100, score);
}

// 生成自然语言建议
export function generateRecommendation(stock) {
  const scores = calculateSixDimensionScore(stock);
  const { composite } = scores;

  let action, actionDetail;
  if (composite >= 85) {
    action = '可以买';
    actionDetail = '综合评分优秀，建议分批建仓';
  } else if (composite >= 70) {
    action = '可以关注';
    actionDetail = '综合评分良好，等待更好时机';
  } else if (composite >= 55) {
    action = '观望';
    actionDetail = '评分一般，建议等待催化剂';
  } else {
    action = '不建议';
    actionDetail = '评分较低，风险收益比不佳';
  }

  return { action, actionDetail, scores };
}

// 生成一句话推荐
export function generateOneLiner(stock) {
  const lines = [];
  if (stock.macd === '金叉' || stock.macd === '多头') lines.push('技术面偏多');
  if (stock.northFlow.includes('净流入')) lines.push('资金持续流入');
  if (stock.profitGrowth > 20) lines.push('业绩高增长');
  if (parseFloat(stock.pe) < 20) lines.push('估值合理');
  if (stock.sectorRank <= 2) lines.push('行业龙头');
  if (lines.length >= 2) return lines.slice(0, 2).join('，');
  return '基本面稳健，值得关注';
}

// 获取综合评分后的top推荐
export function getTopRecommendations(limit = 10) {
  return stocks
    .map((stock) => {
      const { scores } = generateRecommendation(stock);
      return {
        ...stock,
        aiScore: scores.composite,
        oneLiner: generateOneLiner(stock),
        recommendation: generateRecommendation(stock),
        sixScores: scores,
      };
    })
    .sort((a, b) => b.aiScore - a.aiScore)
    .slice(0, limit);
}

// 生成操作建议
export function generateActionAdvice(stock) {
  const scores = calculateSixDimensionScore(stock);
  const advice = {
    initialPosition: 30,
    addOnDip: 5,
    takeProfit: 15,
    stopLoss: 8,
  };

  if (scores.composite >= 85) {
    advice.initialPosition = 40;
    advice.addOnDip = 5;
    advice.takeProfit = 20;
    advice.stopLoss = 8;
  } else if (scores.composite >= 70) {
    advice.initialPosition = 30;
    advice.addOnDip = 8;
    advice.takeProfit = 12;
    advice.stopLoss = 6;
  } else {
    advice.initialPosition = 20;
    advice.addOnDip = 10;
    advice.takeProfit = 8;
    advice.stopLoss = 5;
  }

  return advice;
}
