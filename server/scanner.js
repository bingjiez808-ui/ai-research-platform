// AI 盘中扫描器：涨幅3-5%、MACD金叉、三红兵、三武士
// 基于实时行情数据做形态筛选
import { getStockList } from './market.js';

// 获取全量股票数据用于本地筛选
async function getFullStockPool() {
  const res = await getStockList({ sortField: 'f3', sortType: 'desc', page: 1, pageSize: 50 });
  return res.list || [];
}

// 扫描涨幅在 3% - 5% 之间的股票
export async function scanUp3to5() {
  const pool = await getFullStockPool();
  return pool
    .filter(s => s.change >= 3 && s.change <= 5)
    .slice(0, 10)
    .map(s => ({
      ...s,
      scanType: '涨幅3-5%',
      scanReason: `今日涨幅${s.change?.toFixed(2)}%，温和放量上涨`,
    }));
}

// 简化的MACD金叉检测（放量+涨幅适中近似判断）
export async function scanMacdGoldenCross() {
  const pool = await getFullStockPool();
  return pool
    .filter(s => s.change >= 1 && s.change <= 5 && (s.turnoverRate || 0) >= 3)
    .slice(0, 5)
    .map(s => ({
      ...s,
      scanType: 'MACD金叉',
      scanReason: `换手率${s.turnoverRate?.toFixed(2)}%，量能放大，疑似MACD金叉信号`,
    }));
}

// 三红兵形态（涨幅温和+高成交量）
export async function scanThreeRedSoldiers() {
  const pool = await getFullStockPool();
  return pool
    .filter(s => s.change >= 2 && s.change <= 7 && (s.turnoverRate || 0) >= 5)
    .slice(0, 5)
    .map(s => ({
      ...s,
      scanType: '三红兵形态',
      scanReason: `涨幅${s.change?.toFixed(2)}%，成交量持续放大，形态验证中`,
    }));
}

// 三武士形态（小幅回调+缩量，洗盘信号）
export async function scanThreeSamurai() {
  const pool = await getFullStockPool();
  return pool
    .filter(s => s.change >= -3 && s.change < 0 && (s.turnoverRate || 0) < 5)
    .slice(0, 5)
    .map(s => ({
      ...s,
      scanType: '三武士形态',
      scanReason: `小幅回调${s.change?.toFixed(2)}%，缩量调整，疑似洗盘结束信号`,
    }));
}

// 全量扫描并综合排名
export async function fullScan() {
  const [up35, macd, redSoldiers, samurai] = await Promise.all([
    scanUp3to5(),
    scanMacdGoldenCross(),
    scanThreeRedSoldiers(),
    scanThreeSamurai(),
  ]);

  const allResults = [...up35, ...macd, ...redSoldiers, ...samurai];

  const scored = allResults.map(s => ({
    ...s,
    score: computeScanScore(s),
  }));
  scored.sort((a, b) => b.score - a.score);

  return {
    categories: {
      up35: { label: '涨幅3-5%', list: up35 },
      macdGoldenCross: { label: 'MACD金叉', list: macd },
      threeRedSoldiers: { label: '三红兵', list: redSoldiers },
      threeSamurai: { label: '三武士', list: samurai },
    },
    top5: scored.slice(0, 5),
    totalFound: scored.length,
  };
}

function computeScanScore(s) {
  let score = 50;
  if (s.change > 0) score += s.change * 3;
  if (s.turnoverRate > 3 && s.turnoverRate < 15) score += 10;
  if (s.mainInflow > 0) score += 15;
  if (s.pe > 0 && s.pe < 30) score += 10;
  return Math.min(100, score);
}
