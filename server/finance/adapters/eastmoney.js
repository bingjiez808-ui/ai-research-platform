import axios from 'axios';

const http = axios.create({ timeout: Number(process.env.FINANCE_HTTP_TIMEOUT_MS || 15000), headers: { 'User-Agent': process.env.FINANCE_USER_AGENT || 'ai-research-platform/1.0', Referer: 'https://quote.eastmoney.com/' } });
const fail = (operation, error) => { throw Object.assign(new Error(`Eastmoney ${operation} failed: ${error.message}`), { provider: 'eastmoney', code: 'UPSTREAM_UNAVAILABLE', status: 502, cause: error }); };
export const secid = code => `${String(code).startsWith('6') ? 1 : 0}.${String(code).padStart(6, '0')}`;

export async function fetchQuotes({ page = 1, size = 100 } = {}) {
  try {
    const { data } = await http.get('https://push2.eastmoney.com/api/qt/clist/get', { params: { pn: page, pz: size, po: 1, np: 1, fltt: 2, invt: 2, fid: 'f6', fs: 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23', fields: 'f2,f3,f4,f5,f6,f7,f8,f9,f12,f13,f14,f15,f16,f17,f18,f20,f21,f23,f100,f124' } });
    if (!data?.data?.diff) throw new Error('empty or malformed response');
    return data.data.diff;
  } catch (e) { fail('quotes', e); }
}

export async function fetchFullMarketSnapshot({ pageSize = 500, maxPages = 15 } = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const batch = await fetchQuotes({ page, size: pageSize });
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  const unique = [...new Map(rows.filter(row => row?.f12 && row?.f14).map(row => [String(row.f12), row])).values()];
  if (unique.length < 1000) throw Object.assign(new Error(`Eastmoney snapshot returned only ${unique.length} securities`), { provider: 'eastmoney', code: 'INCOMPLETE_SNAPSHOT', status: 502 });
  return unique;
}

export async function fetchPriceHistory(code, limit = 120) {
  try {
    const { data } = await http.get('https://push2his.eastmoney.com/api/qt/stock/kline/get', { params: { secid: secid(code), klt: 101, fqt: 1, lmt: limit, end: '20500101', fields1: 'f1,f2,f3,f4,f5,f6', fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' } });
    const rows = data?.data?.klines;
    if (!Array.isArray(rows)) throw new Error('empty or malformed response');
    return rows;
  } catch (e) { fail('price history', e); }
}

export async function fetchAnnouncements(code, size = 30) {
  try {
    const { data } = await http.get('https://np-anotice-stock.eastmoney.com/api/security/ann', { params: { sr: -1, page_size: size, page_index: 1, ann_type: 'A', client_source: 'web', stock_list: code } });
    const rows = data?.data?.list;
    if (!Array.isArray(rows)) throw new Error('empty or malformed response');
    return rows;
  } catch (e) { fail('announcements', e); }
}

export async function fetchFinancials(code, reportName = 'RPT_F10_FINANCE_MAINFINADATA') {
  try {
    const { data } = await http.get('https://datacenter-web.eastmoney.com/api/data/v1/get', { params: { reportName, columns: 'ALL', filter: `(SECURITY_CODE="${String(code).padStart(6, '0')}")`, pageNumber: 1, pageSize: 12, sortColumns: 'REPORT_DATE', sortTypes: -1, source: 'WEB', client: 'WEB' } });
    if (!data?.success || !Array.isArray(data?.result?.data)) throw new Error(data?.message || 'empty or malformed response');
    return data.result.data;
  } catch (e) { fail('financial statements', e); }
}

export async function fetchResearchReports(code, size = 30) {
  try {
    const endTime = new Date().toISOString().slice(0, 10);
    const beginTime = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    const { data } = await http.get('https://reportapi.eastmoney.com/report/list', { params: {
      industryCode: '*', pageSize: size, industry: '*', rating: '*', ratingchange: '*',
      beginTime, endTime, pageNo: 1, fields: '', qType: 0, orgCode: '', code, rcode: '',
      p: 1, pageNum: 1, pageNumber: 1, _: Date.now(),
    } });
    if (!Array.isArray(data?.data)) throw new Error('empty or malformed response');
    return data.data;
  } catch (e) { fail('research reports', e); }
}

export async function fetchMarketIndicators() {
  try {
    const { data } = await http.get('https://push2.eastmoney.com/api/qt/ulist.np/get', { params: { fltt: 2, fields: 'f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18,f124', secids: '1.000001,0.399001,0.399006,1.000688' } });
    if (!Array.isArray(data?.data?.diff)) throw new Error('empty or malformed response');
    return data.data.diff;
  } catch (e) { fail('market indicators', e); }
}
