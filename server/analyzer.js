// AI 分析引擎：将原始行情数据转化为普通投资者可理解的分析结论
// 六维评分体系：基本面 + 技术面 + 资金面 + 行业面 + 情绪面 + 风险面

// --- 评分计算 ---

export function computeSixDScore(stock) {
  const fundamental = scoreFundamental(stock);
  const technical = scoreTechnical(stock);
  const capital = scoreCapital(stock);
  const industry = scoreIndustry(stock);
  const sentiment = scoreSentiment(stock);
  const risk = scoreRisk(stock);

  const composite = Math.round(
    fundamental * 0.30 + technical * 0.15 + capital * 0.20 + industry * 0.15 + sentiment * 0.10 + risk * 0.10
  );

  return { fundamental, technical, capital, industry, sentiment, risk, composite };
}

function scoreFundamental(s) {
  let score = 60;
  if (s.pe > 0 && s.pe < 20) score += 15;
  else if (s.pe > 0 && s.pe < 40) score += 5;
  else if (s.pe > 100) score -= 10;
  if (s.pb > 0 && s.pb < 2) score += 10;
  else if (s.pb > 5) score -= 5;
  if (s.marketCap > 1000e8) score += 10;
  if (s.mainInflow > 0) score += 5;
  return Math.max(10, Math.min(100, score));
}

function scoreTechnical(s) {
  let score = 50;
  if (s.change > 0 && s.change < 3) score += 15;
  else if (s.change >= 3 && s.change <= 5) score += 10;
  else if (s.change > 5) score -= 5;
  else if (s.change < -3) score -= 15;
  if (s.amplitude > 3 && s.amplitude < 8) score += 5;
  if (s.turnoverRate > 2 && s.turnoverRate < 10) score += 10;
  return Math.max(10, Math.min(100, score));
}

function scoreCapital(s) {
  let score = 50;
  if (s.mainInflow > 1e8) score += 20;
  else if (s.mainInflow > 0) score += 10;
  else if (s.mainInflow < -1e8) score -= 15;
  if (s.turnoverRate > 3 && s.change > 0) score += 5;
  return Math.max(10, Math.min(100, score));
}

function scoreIndustry(s) {
  return 70; // 需要行业数据补充
}

function scoreSentiment(s) {
  let score = 50;
  if (s.change > 2) score += 20;
  else if (s.change > 0) score += 10;
  else if (s.change < -2) score -= 10;
  return Math.max(10, Math.min(100, score));
}

function scoreRisk(s) {
  let score = 50;
  if (Math.abs(s.change) > 7) score -= 20;
  if (s.amplitude > 10) score -= 15;
  if (s.pe > 80) score -= 10;
  if (s.turnoverRate > 15) score -= 10;
  return Math.max(10, Math.min(100, score));
}

// --- 自然语言生成 ---

export function generateConclusion(stock, scores) {
  const c = scores.composite;
  const chg = stock.change || 0;

  if (c >= 85) {
    return chg > 3
      ? '整体评分优秀，但短期涨幅偏大，适合回调后分批买入。'
      : '整体评分优秀，基本面扎实、资金持续关注，适合中长期配置。';
  } else if (c >= 70) {
    return '综合表现良好，可以作为组合中的卫星配置，建议分步建仓。';
  } else if (c >= 55) {
    return chg > 0
      ? '当前处于合理区间，适合持有观察，不建议此时追高。'
      : '估值偏高或基本面有待改善，建议观望等待更好时机。';
  } else {
    return '当前风险偏高，各方面指标偏弱，建议暂时回避或严格止损。';
  }
}

export function generateReasons(stock, scores) {
  const reasons = [];
  if (stock.change > 0 && stock.change < 5) reasons.push('今日小幅上涨，走势平稳');
  if (stock.change >= 5) reasons.push('今日涨幅较大，短线情绪高涨');
  if (stock.change < 0 && stock.change > -3) reasons.push('今日小幅回调，属正常波动');
  if (stock.change <= -3) reasons.push('今日跌幅较大，需关注是否有利空消息');
  if (stock.pe > 0 && stock.pe < 20) reasons.push('当前估值处于历史较低水平');
  if (stock.pe > 50) reasons.push('当前估值偏贵，市场预期较高');
  if (stock.mainInflow > 1e8) reasons.push('主力资金明显流入，机构关注度高');
  if (stock.mainInflow < -1e8) reasons.push('主力资金流出，短期有抛压风险');
  if (scores.fundamental >= 75) reasons.push('基本面稳健，盈利能力强');
  if (scores.technical >= 70) reasons.push('技术走势健康，趋势保持向上');
  return reasons.slice(0, 5);
}

export function generateRisks(stock, scores) {
  const risks = [];
  if (Math.abs(stock.change) > 7) risks.push('今日波动剧烈，短线追高风险较大');
  if (stock.pe > 80) risks.push('估值过高，存在估值回归风险');
  if (stock.turnoverRate > 15) risks.push('换手率偏高，筹码稳定性不足');
  if (stock.amplitude > 10) risks.push('振幅较大，股价波动剧烈');
  if (stock.mainInflow < -5000e4) risks.push('主力资金持续流出');
  if (stock.marketCap < 50e8) risks.push('市值偏小，流动性风险较高');
  if (scores.risk < 40) risks.push('风险指标偏高，需控制仓位');
  risks.push('任何投资都有风险，市场存在不确定因素');
  return risks.slice(0, 5);
}

export function generateSuggestion(stock, scores) {
  const c = scores.composite;
  if (c >= 85) {
    return '建议：可考虑首次建仓30%，在回调3-5%时加仓，长期持有。以上为AI分析，不构成投资建议。';
  } else if (c >= 70) {
    return '建议：先建10-20%观察仓，确认趋势后逐步加仓。以上为AI分析，不构成投资建议。';
  } else if (c >= 55) {
    return '建议：暂时观望，等待回调到关键技术位或利好消息确认后再考虑。以上为AI分析，不构成投资建议。';
  } else {
    return '建议：不建议当前介入，可将其加入自选观察。以上为AI分析，不构成投资建议。';
  }
}

// --- 市场温度 ---

export function computeMarketTemperature(indexes, breadth) {
  const shIdx = indexes.find(i => i.code === '000001');
  const szIdx = indexes.find(i => i.code === '399001');
  const cyIdx = indexes.find(i => i.code === '399006');

  let score = 50;
  if (shIdx && shIdx.change > 0.5) score += 15;
  else if (shIdx && shIdx.change < -0.5) score -= 15;
  if (szIdx && szIdx.change > 0.5) score += 10;
  if (cyIdx && cyIdx.change > 0.5) score += 10;

  const total = breadth.totalCount || 4000;
  const upRatio = (breadth.upCount || 0) / total;
  if (upRatio > 0.6) score += 15;
  else if (upRatio > 0.45) score += 5;
  else if (upRatio < 0.3) score -= 15;

  let level, emoji, color;
  if (score >= 70) { level = '乐观'; emoji = '🟢'; color = '#e74c3c'; }
  else if (score >= 45) { level = '中性'; emoji = '🟡'; color = '#f39c12'; }
  else { level = '谨慎'; emoji = '🔴'; color = '#27ae60'; }

  return { score, level, emoji, color };
}

export function generateTemperatureReason(indexes, breadth, northFlow) {
  const parts = [];
  const shIdx = indexes.find(i => i.code === '000001');
  const cyIdx = indexes.find(i => i.code === '399006');

  if (breadth.upCount) parts.push(`上涨${breadth.upCount}家，下跌${breadth.downCount}家`);
  if (shIdx) {
    parts.push(`上证${indexDir(shIdx.change)}${Math.abs(shIdx.change).toFixed(2)}%`);
  }
  if (cyIdx) {
    parts.push(`创业板${indexDir(cyIdx.change)}${Math.abs(cyIdx.change).toFixed(2)}%`);
  }
  if (northFlow?.totalNetInflow) {
    parts.push(`北向资金净流入${fmtMoney(northFlow.totalNetInflow)}`);
  }
  return parts.join('，') + '。';
}

export function generateDailySummary(indexes, breadth) {
  const total = breadth.totalCount || 4000;
  const upRatio = breadth.upCount ? (breadth.upCount / total * 100).toFixed(0) : '--';
  return `今日市场${breadth.upCount > breadth.downCount ? '整体偏强' : '整体偏弱'}，约${upRatio}%股票上涨。建议关注资金持续流入的行业，避免追高短期涨幅过大的个股。`;
}

// --- 辅助 ---

function indexDir(change) {
  return change >= 0 ? '涨' : '跌';
}

function fmtMoney(v) {
  if (!v) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e8) return (v / 1e8).toFixed(2) + '亿元';
  if (abs >= 1e4) return (v / 1e4).toFixed(0) + '万元';
  return v.toFixed(0) + '元';
}
