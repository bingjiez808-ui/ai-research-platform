import axios from 'axios';
import { DataProvider } from './interface.js';

const symbol = code => `${String(code).startsWith('6') ? 'sh' : 'sz'}${String(code).padStart(6, '0')}`;
export class SinaProvider extends DataProvider {
  constructor() { super('sina'); this.http = axios.create({ timeout: Number(process.env.FINANCE_HTTP_TIMEOUT_MS || 20000), responseType: 'arraybuffer', headers: { Referer: 'https://finance.sina.com.cn/' } }); }
  async dailyQuotes({ codes = [] } = {}) {
    if (!codes.length) throw Object.assign(new Error('codes is required for Sina quotes'), { code: 'INVALID_ARGUMENT', status: 400 });
    const { data } = await this.http.get(`https://hq.sinajs.cn/list=${codes.map(symbol).join(',')}`);
    const text = new TextDecoder('gbk').decode(data);
    return text.split('\n').map(line => { const match = line.match(/hq_str_(\w+)="(.*)"/); if (!match || !match[2]) return null; const v = match[2].split(','); return { symbol: match[1], code: match[1].slice(2), name: v[0], open: Number(v[1]), preClose: Number(v[2]), close: Number(v[3]), high: Number(v[4]), low: Number(v[5]), volume: Number(v[8]), amount: Number(v[9]), date: v[30], time: v[31], provider: this.id }; }).filter(Boolean);
  }
  indexQuotes() { return this.dailyQuotes({ codes: ['000001', '399001', '399006'] }); }
}
