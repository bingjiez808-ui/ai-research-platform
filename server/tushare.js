// Tushare Pro 数据层（可选数据源）
// 设计原则：
//  - token 仅来自环境变量 TUSHARE_TOKEN（生产在 Render Environment 配置，本地用 .env），绝不硬编码。
//  - 未配置 token 时，所有导出函数返回 null / 空，调用方自动回退到现有腾讯公开行情，不影响运行。
//  - 用途 1：作为权威源校验 A 股 universe 口径（上市/暂停/退市，沪/深/北交易所拆分），
//           直接回应"不要用生成的代码宇宙冒充权威"的诚实要求。
//  - 用途 2：best-effort 补充 PE/PB 等基本面（daily_basic），覆盖腾讯基础接口无字段的情况。
//  - 绝不把本站枚举值标为 Tushare 口径；Tushare 不可达/限流时静默跳过，沿用现有数据。
import axios from 'axios';

const TOKEN = process.env.TUSHARE_TOKEN;
export const isConfigured = Boolean(TOKEN);

const tushareApi = axios.create({
  baseURL: 'https://api.tushare.pro',
  timeout: 12000,
  headers: { 'Content-Type': 'application/json' },
});

// 调用 Tushare HTTP 接口；未配置 token 直接返回 null。
async function callTushare(apiName, params = {}, fields = '') {
  if (!isConfigured) return null;
  const res = await tushareApi.post('', { api_name: apiName, token: TOKEN, params, fields });
  const body = res.data;
  if (!body || body.code !== 0) {
    throw new Error(body?.msg || `Tushare ${apiName} 返回异常 code=${body?.code}`);
  }
  return body.data; // { fields: [...], items: [[...]] }
}

function rowsToObjects(data) {
  if (!data || !data.fields || !data.items) return [];
  return data.items.map((it) => {
    const o = {};
    data.fields.forEach((k, i) => { o[k] = it[i]; });
    return o;
  });
}

// 把 6 位 A 股代码转 Tushare ts_code（含北交所 .BJ）
export function toTsCode(code) {
  const c = String(code).padStart(6, '0');
  if (c.startsWith('6') || c.startsWith('9')) return `${c}.SH`; // 沪市主板 / 科创板
  if (c.startsWith('4') || c.startsWith('8')) return `${c}.BJ`; // 北交所
  return `${c}.SZ`; // 深市主板 / 创业板
}

// 拉取官方「上市」股票全集，返回权威 universe 与交易所拆分。
// 注：仅 list_status='L'（上市中）。暂停/退市由调用方用 stock_basic 另查或文档化说明。
// 免费账户的 stock_basic 通常只有每小时一次调用额度。该接口本身可在单次
// 响应中返回当前上市全集，因此不能按 5000 条分页，否则第二页会立即触发
// 限流并让已经拿到的第一页也被整体丢弃。
export async function getListedUniverse() {
  if (!isConfigured) return null;
  const data = await callTushare('stock_basic', {
    exchange: '',
    list_status: 'L',
    fields: 'ts_code,symbol,name,exchange,list_status,delist_date',
  });
  const all = rowsToObjects(data);
  const byExchange = { SSE: 0, SZSE: 0, BSE: 0, OTHER: 0 };
  for (const r of all) {
    const ex = String(r.exchange || '').toUpperCase();
    if (ex === 'SSE' || ex === 'SZSE' || ex === 'BSE') byExchange[ex]++;
    else byExchange.OTHER++;
  }
  return { total: all.length, byExchange, stocks: all };
}

// best-effort 拉取单只股票最近交易日基本面（PE/PB 等），向前最多试 5 个交易日。
export async function getDailyBasic(tsCode) {
  if (!isConfigured || !tsCode) return null;
  const today = new Date();
  for (let back = 0; back < 5; back++) {
    const d = new Date(today);
    d.setDate(d.getDate() - back);
    const tradeDate =
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    try {
      const data = await callTushare('daily_basic', {
        ts_code: tsCode,
        trade_date: tradeDate,
        fields: 'ts_code,trade_date,pe_ttm,pb,pe,turnover_rate,total_mv,circ_mv',
      });
      const rows = rowsToObjects(data);
      if (rows.length) return rows[0];
    } catch {
      // 该日无数据（非交易日），继续往前找
    }
  }
  return null;
}
