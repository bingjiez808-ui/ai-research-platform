// AI 投研平台 - Express 后端服务
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getMarketIndexes,
  getMarketBreadth,
  searchStocks,
  getStockList,
  getStockQuote,
  getStockFundFlow,
  getNorthBoundFlow,
  getIndustryRanking,
  getConceptRanking,
  getStockNotices,
} from './market.js';
import * as tushare from './tushare.js';
import {
  computeSixDScore,
  generateConclusion,
  generateReasons,
  generateRisks,
  generateSuggestion,
  computeMarketTemperature,
  generateTemperatureReason,
  generateDailySummary,
} from './analyzer.js';
import { fullScan } from './scanner.js';

// 全局错误处理 - 防止进程因未捕获异常崩溃
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason?.message || reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ==================== 首页仪表盘 API ====================

app.get('/api/market/overview', async (req, res) => {
  try {
    const [indexes, breadth, northFlow] = await Promise.all([
      getMarketIndexes(),
      getMarketBreadth(),
      getNorthBoundFlow(),
    ]);

    const temperature = computeMarketTemperature(indexes, breadth);
    const temperatureReason = generateTemperatureReason(indexes, breadth, northFlow);
    const dailySummary = generateDailySummary(indexes, breadth);

    res.json({
      success: true,
      data: {
        indexes,
        breadth,
        northFlow,
        temperature: { ...temperature, reason: temperatureReason },
        dailySummary,
        updateTime: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Market overview error:', err.message);
    res.status(500).json({ success: false, message: '获取市场数据失败，请稍后重试' });
  }
});

app.get('/api/market/hot-industries', async (req, res) => {
  try {
    const [industries, concepts] = await Promise.all([
      getIndustryRanking(),
      getConceptRanking(),
    ]);
    res.json({ success: true, data: { industries, concepts } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 股票推荐 API ====================

app.get('/api/stocks/recommend', async (req, res) => {
  try {
    // 获取涨幅榜 + 主力资金流入榜
    const [gainers, mainInflow] = await Promise.all([
      getStockList({ sortField: 'f3', sortType: 'desc', pageSize: 30 }),
      getStockList({ sortField: 'f62', sortType: 'desc', pageSize: 30 }),
    ]);

    // 合并去重，计算AI综合评分
    const allStocks = new Map();
    for (const s of [...gainers.list, ...mainInflow.list]) {
      if (!allStocks.has(s.code)) {
        const scores = computeSixDScore(s);
        allStocks.set(s.code, {
          ...s,
          scores,
          conclusion: generateConclusion(s, scores),
          reasons: generateReasons(s, scores),
          suggestion: generateSuggestion(s, scores),
        });
      }
    }

    const top10 = Array.from(allStocks.values())
      .sort((a, b) => b.scores.composite - a.scores.composite)
      .slice(0, 10);

    res.json({ success: true, data: top10 });
  } catch (err) {
    console.error('Recommend error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 股票详情 API ====================

app.get('/api/stocks/detail', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ success: false, message: '请提供股票代码' });

    const [quote, fundFlow, notices] = await Promise.all([
      getStockQuote(code),
      getStockFundFlow(code),
      getStockNotices(code).catch(() => []),
    ]);

    if (!quote || !quote.name) {
      return res.status(404).json({ success: false, message: '未找到该股票信息' });
    }

    const stockData = {
      code,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changeAmount: quote.changeAmount,
      prevClose: quote.yestClose || 0,
      open: quote.open,
      high: quote.high,
      low: quote.low,
      volume: quote.volume,
      turnover: quote.turnover,
      marketCap: quote.marketCap,
      circCap: quote.circCap || (quote.marketCap * 0.7),
      pe: quote.pe,
      pb: quote.pb,
      roe: quote.roe || 0,
      turnoverRate: quote.turnoverRate,
      amplitude: quote.amplitude,
      fundFlow: fundFlow ? {
        mainNetInflow: fundFlow.mainNetInflow,
        superLargeNetInflow: fundFlow.superLargeNetInflow,
        largeNetInflow: fundFlow.largeNetInflow,
      } : null,
      notices: notices.slice(0, 3),
    };

    const scores = computeSixDScore(stockData);

    res.json({
      success: true,
      data: {
        ...stockData,
        scores,
        analysis: {
          conclusion: generateConclusion(stockData, scores),
          reasons: generateReasons(stockData, scores),
          risks: generateRisks(stockData, scores),
          suggestion: generateSuggestion(stockData, scores),
          confidence: Math.min(5, Math.ceil(scores.composite / 20)),
        },
        updateTime: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('Stock detail error:', err.message);
    res.status(500).json({ success: false, message: '获取股票数据失败' });
  }
});

app.get('/api/stocks/search', async (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword) return res.json({ success: true, data: [] });
    const data = await searchStocks(keyword);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get('/api/stocks/list', async (req, res) => {
  try {
    const { sort = 'f3', order = 'desc', page = 1, size = 20 } = req.query;
    const data = await getStockList({
      sortField: sort,
      sortType: order,
      page: Number(page),
      pageSize: Number(size),
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 扫描 API ====================

app.get('/api/scan/full', async (req, res) => {
  try {
    const data = await fullScan();
    res.json({ success: true, data });
  } catch (err) {
    console.error('Scan error:', err.message);
    res.status(500).json({ success: false, message: '扫描失败，请稍后重试' });
  }
});

// ==================== 持仓分析 API ====================

app.post('/api/portfolio/analyze', async (req, res) => {
  try {
    const { stocks } = req.body;
    if (!stocks || !stocks.length) {
      return res.status(400).json({ success: false, message: '请提供持仓数据' });
    }

    const results = [];
    for (const holding of stocks) {
      try {
        const quote = await getStockQuote(holding.code);
        if (!quote || !quote.name) continue;

        const currentPrice = quote.price;
        const profitRate = holding.costPrice
          ? ((currentPrice - holding.costPrice) / holding.costPrice * 100).toFixed(2)
          : 0;

        const stockData = {
          code: holding.code,
          name: quote.name,
          price: currentPrice,
          change: quote.change || 0,
          pe: quote.pe || 0,
          pb: quote.pb || 0,
          marketCap: quote.marketCap,
          turnoverRate: quote.turnoverRate || 0,
          mainInflow: 0,
        };

        const scores = computeSixDScore(stockData);

        results.push({
          ...holding,
          name: stockData.name,
          currentPrice,
          profitRate: Number(profitRate),
          marketValue: (currentPrice * holding.shares).toFixed(2),
          scores,
          suggestion: generateSuggestion(stockData, scores),
        });
      } catch (e) {
        results.push({ ...holding, error: true, message: '数据获取失败' });
      }
    }

    const totalMarketValue = results
      .filter(r => !r.error)
      .reduce((sum, r) => sum + Number(r.marketValue || 0), 0);

    const validResults = results.filter(r => !r.error && r.scores);
    const avgScore = validResults.length > 0
      ? Math.round(validResults.reduce((sum, r) => sum + (r.scores?.composite || 0), 0) / validResults.length)
      : 0;

    const healthLabel = avgScore >= 75 ? '健康' : avgScore >= 55 ? '一般' : '需关注';

    res.json({
      success: true,
      data: {
        holdings: results,
        summary: {
          totalMarketValue,
          stockCount: results.length,
          avgScore,
          healthLabel,
        },
      },
    });
  } catch (err) {
    console.error('Portfolio error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== 健康检查 ====================

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ==================== 临时诊断：Tushare 配置与连通性 ====================
app.get('/api/debug/tushare', async (req, res) => {
  // 列出所有 env key 名（不含值），用于发现隐藏字符/拼写差异
  const allKeys = Object.keys(process.env);
  const tokenLike = allKeys.filter(k => /tush|token/i.test(k));
  const configured = Boolean(process.env.TUSHARE_TOKEN);
  const info = {
    configured,
    nodeEnv: process.env.NODE_ENV || null,
    envKeyPresent: configured,
    envKeyCount: allKeys.length,
    keysContainingTokenOrTush: tokenLike,
    exactTushareKeyPresent: allKeys.includes('TUSHARE_TOKEN'),
  };
  if (configured) {
    try {
      const u = await tushare.getListedUniverse();
      info.probe = 'ok';
      info.total = u && u.total;
      info.byExchange = u && u.byExchange;
    } catch (e) {
      info.probe = 'error';
      info.error = e.message;
    }
  }
  res.json({ success: true, data: info });
});

// ==================== 生产环境静态文件服务 ====================

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.use((req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(distPath, 'index.html'));
  }
});

// ==================== 启动 ====================

// 绑定 0.0.0.0 以便云主机/容器可从外部访问（PORT 由环境变量注入）
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ AI 投研平台后端已启动: http://0.0.0.0:${PORT}`);
  console.log(`   市场概览: http://localhost:${PORT}/api/market/overview`);
  console.log(`   股票推荐: http://localhost:${PORT}/api/stocks/recommend`);
  console.log(`   盘中扫描: http://localhost:${PORT}/api/scan/full`);
});
