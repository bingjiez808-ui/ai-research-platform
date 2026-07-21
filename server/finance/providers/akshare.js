import axios from 'axios';
import { DataProvider, requireConfigured } from './interface.js';

export class AkShareProvider extends DataProvider {
  constructor() { super('akshare'); this.baseURL = process.env.AKSHARE_WORKER_URL; this.http = axios.create({ baseURL: this.baseURL, timeout: Number(process.env.AKSHARE_TIMEOUT_MS || 60000) }); }
  isConfigured() { return Boolean(this.baseURL); }
  async get(path, params) { requireConfigured(this); const { data } = await this.http.get(path, { params }); return data.data; }
  stockBasic(params = {}) { return this.get('/v1/stocks/basic', params); }
  dailyQuotes(params = {}) { return this.get('/v1/stocks/quotes', params); }
  financialIndicators(params = {}) { return this.get('/v1/stocks/financials', params); }
  async industries(params = {}) { return this.get('/v1/industries', params); }
  async health() { if (!this.isConfigured()) return { provider: this.id, configured: false, healthy: false, reason: 'AKSHARE_WORKER_URL missing' }; try { const { data } = await this.http.get('/health'); return { provider: this.id, configured: true, healthy: data.status === 'ok', details: data }; } catch (error) { return { provider: this.id, configured: true, healthy: false, reason: error.message }; } }
}
