const METHOD = 'deterministic-rules';
const VERSION = 'finance-rules-1.0.0';
const n = value => value == null ? null : Number(value);

export function marketAnalyst(indicators) {
  const changes = indicators.filter(x => x.key.endsWith('.change_pct')).map(x => n(x.value)).filter(Number.isFinite);
  const average = changes.length ? changes.reduce((a,b) => a+b, 0) / changes.length : null;
  const signal = average == null ? 'insufficient-data' : average > 1 ? 'risk-on' : average < -1 ? 'risk-off' : 'neutral';
  return { agent: 'market-analyst', method: METHOD, version: VERSION, score: average == null ? null : Math.max(0, Math.min(100, 50 + average * 10)), signal, summary: average == null ? '指数涨跌数据不足，无法形成市场判断。' : `主要指数平均涨跌幅 ${average.toFixed(2)}%，规则信号为 ${signal}。`, evidence: indicators.map(x => ({ key: x.key, value: String(x.value), observedAt: x.observedAt })), risks: ['规则仅基于已入库指数数据，不构成投资建议。'] };
}

export function stockResearch(stock) {
  const p = stock.prices?.[0]; const f = stock.statements?.[0]; const change = n(p?.changePercent); const profit = n(f?.netProfit); const revenue = n(f?.revenue);
  let score = 50; if (change != null) score += Math.max(-20, Math.min(20, change * 3)); if (profit != null) score += profit > 0 ? 10 : -15; if (revenue != null && revenue > 0) score += 5; score = Math.max(0, Math.min(100, score));
  const signal = score >= 70 ? 'positive' : score <= 35 ? 'cautious' : 'neutral';
  return { agent: 'stock-research', method: METHOD, version: VERSION, score, signal, summary: `${stock.name}（${stock.code}）规则评分 ${score.toFixed(1)}，信号 ${signal}。`, evidence: [{ latestPrice: p ? String(p.close) : null, changePercent: change, latestRevenue: revenue, latestNetProfit: profit, priceFetchedAt: p?.fetchedAt || null }], risks: ['数据可能延迟或不完整。', '确定性规则不是预测模型，不构成投资建议。'] };
}

export function newsIntelligence(articles) {
  const positive = /增长|中标|回购|增持|盈利|分红|突破/; const negative = /亏损|减持|处罚|诉讼|风险|终止|退市/;
  const evidence = articles.map(a => ({ id: String(a.id), title: a.title, score: positive.test(a.title) ? 1 : negative.test(a.title) ? -1 : 0, publishedAt: a.publishedAt }));
  const avg = evidence.length ? evidence.reduce((s,x)=>s+x.score,0)/evidence.length : null;
  return { agent: 'news-intelligence', method: METHOD, version: VERSION, score: avg == null ? null : 50 + avg * 30, signal: avg == null ? 'insufficient-data' : avg > .15 ? 'positive' : avg < -.15 ? 'negative' : 'neutral', summary: avg == null ? '暂无已入库新闻公告。' : `分析 ${evidence.length} 条真实公告标题，平均规则情绪 ${avg.toFixed(2)}。`, evidence, risks: ['仅做关键词规则分类，未伪装为大模型推理。'] };
}
