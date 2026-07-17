// 东方财富公开行情 API 封装
// 数据来源：东方财富网公开接口，仅用于个人学习研究
import axios from 'axios';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

const api = axios.create({
  headers: {
    'User-Agent': UA,
    'Referer': 'https://quote.eastmoney.com/',
  },
  timeout: 15000,
});

// ==================== 市场概览 ====================

// 获取主要指数实时行情
export async function getMarketIndexes() {
  const codes = ['1.000001', '0.399001', '0.399006', '1.000688', '0.399673'];
  const res = await api.get('https://push2.eastmoney.com/api/qt/ulist.np/get', {
    params: {
      fltt: 2,
      fields: 'f2,f3,f4,f12,f14,f15,f16,f17,f18',
      secids: codes.join(','),
    },
  });
  const raw = res.data?.data?.diff || [];
  return raw.map(item => ({
    code: item.f12,
    name: item.f14,
    price: item.f2,
    change: item.f3,       // 涨跌幅%
    changeAmount: item.f4,  // 涨跌额
    high: item.f15,
    low: item.f16,
    volume: item.f17,
    turnover: item.f18,
  }));
}

// 获取涨跌家数统计
export async function getMarketBreadth() {
  const res = await api.get('https://push2.eastmoney.com/api/qt/ulist.np/get', {
    params: {
      fltt: 1,
      fields: 'f104,f105,f106',
      secids: '1.000001',
    },
  });
  const d = res.data?.data?.diff?.[0] || {};
  return {
    upCount: d.f104 || 0,
    downCount: d.f106 || 0,
    flatCount: d.f105 || 0,
    totalCount: (d.f104 || 0) + (d.f106 || 0) + (d.f105 || 0),
  };
}

// ==================== 股票列表 / 推荐 ====================

// 获取全市场股票排行（按指定条件排序）
export async function getStockList({ sortField = 'f3', sortType = 'desc', page = 1, pageSize = 10, filter = '' } = {}) {
  const params = {
    pn: page,
    pz: pageSize,
    po: sortType === 'desc' ? 0 : 1,
    np: 1,
    ut: 'bd1d9ddb04089700cf9c27f6f7426281',
    fltt: 2,
    invt: 2,
    fid: sortField,
    fs: `m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23${filter}`,
    fields: 'f2,f3,f4,f5,f6,f7,f8,f9,f10,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f24,f25,f62,f115,f124,f128,f136,f152',
  };
  const res = await api.get('https://push2.eastmoney.com/api/qt/clist/get', { params });
  const data = res.data?.data;
  const list = data?.diff || [];
  return {
    total: data?.total || 0,
    list: list.map(formatStock),
  };
}

// 搜索股票
export async function searchStocks(keyword) {
  const res = await api.get('https://searchadapter.eastmoney.com/api/suggest/get', {
    params: {
      input: keyword,
      type: 14,
      token: 'D43BF722C8E33BDC906FB84D85E326E8',
      count: 20,
    },
  });
  const data = res.data?.QuotationCodeTable?.Data || [];
  return data
    .filter(item => item.Classify === '股票' || item.Market === '上证A' || item.Market === '深证A')
    .map(item => ({
      code: item.Code,
      name: item.Name,
      market: item.Market,
    }));
}

// ==================== 单只股票详情 ====================

// 获取个股实时行情
export async function getStockQuote(code) {
  const secid = formatSecid(code);
  const res = await api.get('https://push2.eastmoney.com/api/qt/stock/get', {
    params: {
      secid,
      fields: 'f43,f44,f45,f46,f47,f48,f49,f50,f51,f52,f55,f57,f58,f60,f116,f117,f162,f167,f168,f169,f170,f171',
      fltt: 1,
    },
  });
  return res.data?.data || null;
}

// 获取个股资金流向
export async function getStockFundFlow(code) {
  const secid = formatSecid(code);
  const res = await api.get('https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get', {
    params: {
      secid,
      fields1: 'f1,f2,f3,f7',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65',
      lmt: 1,
      klt: 101,
    },
  });
  const kl = res.data?.data?.klines || [];
  if (kl.length === 0) return null;
  const parts = kl[kl.length - 1].split(',');
  return {
    date: parts[0],
    mainNetInflow: Number(parts[1]),    // 主力净流入
    smallNetInflow: Number(parts[3]),    // 小单净流入
    midNetInflow: Number(parts[2]),      // 中单净流入
    largeNetInflow: Number(parts[4]),    // 大单净流入
    superLargeNetInflow: Number(parts[5]), // 超大单净流入
  };
}

// ==================== 板块 / 行业 ====================

// 获取行业板块排行
export async function getIndustryRanking() {
  const res = await api.get('https://push2.eastmoney.com/api/qt/clist/get', {
    params: {
      pn: 1,
      pz: 20,
      po: 0,
      np: 1,
      ut: 'bd1d9ddb04089700cf9c27f6f7426281',
      fltt: 2,
      invt: 2,
      fid: 'f3',
      fs: 'm:90+t:2',
      fields: 'f2,f3,f4,f12,f14,f104,f105,f128,f136,f152',
    },
  });
  const list = res.data?.data?.diff || [];
  return list.map(item => ({
    code: item.f12,
    name: item.f14,
    price: item.f2,
    change: item.f3,
    changeAmount: item.f4,
    upCount: item.f104,
    flatCount: item.f105,
    leadStock: item.f128,
    leadStockChange: item.f136,
  }));
}

// 获取概念板块排行
export async function getConceptRanking() {
  const res = await api.get('https://push2.eastmoney.com/api/qt/clist/get', {
    params: {
      pn: 1,
      pz: 20,
      po: 0,
      np: 1,
      ut: 'bd1d9ddb04089700cf9c27f6f7426281',
      fltt: 2,
      invt: 2,
      fid: 'f3',
      fs: 'm:90+t:3',
      fields: 'f2,f3,f4,f12,f14,f104,f128,f136',
    },
  });
  const list = res.data?.data?.diff || [];
  return list.map(item => ({
    code: item.f12,
    name: item.f14,
    change: item.f3,
    leadStock: item.f128,
  }));
}

// ==================== 北向资金 ====================

export async function getNorthBoundFlow() {
  const res = await api.get('https://push2his.eastmoney.com/api/qt/kamt.kline/get', {
    params: {
      fields1: 'f1,f3,f5',
      fields2: 'f51,f52,f53,f54',
      klt: 101,
      lmt: 5,
    },
  });
  const kl = res.data?.data?.klines || [];
  const today = kl[kl.length - 1]?.split(',') || [];
  return {
    date: today[0],
    totalNetInflow: today[1] ? Number(today[1]) : 0,
    shNetInflow: today[2] ? Number(today[2]) : 0,
    szNetInflow: today[3] ? Number(today[3]) : 0,
  };
}

// ==================== 龙虎榜 ====================

export async function getLhbTop(date = '') {
  const res = await api.get('https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get', {
    params: {
      lmt: 10,
      klt: 101,
      secid: '1.000001',
      fields1: 'f1,f2,f3,f7',
      fields2: 'f51,f52',
    },
  });
  return res.data?.data?.klines || [];
}

// ==================== 公告/新闻 ====================

export async function getStockNotices(code) {
  const res = await api.get('https://np-anotice-stock.eastmoney.com/api/security/ann', {
    params: {
      sr: -1,
      page_size: 5,
      page_index: 1,
      ann_type: 'A',
      client_source: 'web',
      stock_list: code,
    },
  });
  return (res.data?.data?.list || []).map(item => ({
    title: item.title,
    date: item.notice_date?.split(' ')[0],
    url: item.url,
  }));
}

// ==================== 辅助函数 ====================

function formatSecid(code) {
  if (code.startsWith('6')) return `1.${code}`;
  if (code.startsWith('0') || code.startsWith('3')) return `0.${code}`;
  if (code.startsWith('00')) return `0.${code}`; // 深市 00 开头
  return `1.${code}`; // 默认沪市
}

function formatStock(item) {
  const code = item.f12 || '';
  const shCode = code.startsWith('6');
  return {
    code,
    name: item.f14,
    price: item.f2,
    change: item.f3,
    changeAmount: item.f4,
    open: item.f17,
    high: item.f15,
    low: item.f16,
    volume: item.f5,
    turnover: item.f6,
    turnoverRate: item.f8,     // 换手率
    pe: item.f9,                // PE(TTM)
    pb: item.f23,               // PB
    marketCap: item.f20,        // 总市值
    circCap: item.f21,          // 流通市值
    amplitude: item.f7,         // 振幅
    mainInflow: item.f62,       // 主力净流入
    sh: shCode ? 'SH' : 'SZ',
  };
}
