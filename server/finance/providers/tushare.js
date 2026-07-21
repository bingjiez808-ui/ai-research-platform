import axios from 'axios';
import { DataProvider, requireConfigured } from './interface.js';
import { cachedLoad, readCache, writeCache } from './cache.js';

const fields = rows => rows?.data?.items?.map(item => Object.fromEntries(rows.data.fields.map((field, i) => [field, item[i]]))) || [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const DAY = 86400000;

export class TushareProvider extends DataProvider {
  constructor() { super('tushare'); this.token = process.env.TUSHARE_TOKEN; this.http = axios.create({ baseURL: process.env.TUSHARE_API_URL || 'https://api.tushare.pro', timeout: Number(process.env.FINANCE_HTTP_TIMEOUT_MS || 20000) }); }
  isConfigured() { return Boolean(this.token); }
  async call(apiName, params = {}, selectedFields = '') {
    requireConfigured(this); const attempts=Number(process.env.TUSHARE_RETRY_ATTEMPTS||3),maxDelay=Number(process.env.TUSHARE_MAX_RETRY_DELAY_MS||60000); let last;
    for(let attempt=1;attempt<=attempts;attempt++) try {
      const { data } = await this.http.post('', { api_name: apiName, token: this.token, params, fields: selectedFields });
      if (data?.code !== 0) { const rateLimited=/频率超限/.test(data?.msg||''); const retryAfter=rateLimited?(/1次\/小时/.test(data.msg)?3600:60):null; throw Object.assign(new Error(data?.msg || `Tushare ${apiName} failed`), { code: rateLimited?'RATE_LIMITED':'UPSTREAM_ERROR', status: rateLimited?429:502, provider: this.id, retryAfter }); }
      return fields(data);
    } catch(error) {
      last=error; const httpRetry=error.response?.status===429||error.response?.status>=500; if(!httpRetry||attempt===attempts||error.code==='RATE_LIMITED')throw error;
      const header=Number(error.response?.headers?.['retry-after']); const delay=Math.min(maxDelay,Number.isFinite(header)?header*1000:1000*2**(attempt-1)); await sleep(delay);
    }
    throw last;
  }
  async stockBasic(params = {}, options = {}) { const result=await cachedLoad(this.id,'stock_basic:listed',{ttlMs:7*DAY,staleMs:30*DAY,...options},()=>this.call('stock_basic',{exchange:'',list_status:'L',...params},'ts_code,symbol,name,area,industry,market,exchange,list_date')); return result.payload; }
  dailyQuotes(params = {}) { return this.call('daily', params, 'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount'); }
  async indexQuotes(params = {}, options = {}) { const key=`index_daily:${params.ts_code||'all'}:${params.trade_date||params.start_date||'latest'}:${params.end_date||''}`; const result=await cachedLoad(this.id,key,{ttlMs:2*DAY,staleMs:14*DAY,...options},()=>this.call('index_daily',params,'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount')); return result.payload; }
  financialIndicators(params = {}) { return this.call('fina_indicator', params, 'ts_code,ann_date,end_date,roe,grossprofit_margin,netprofit_margin,netprofit_yoy,or_yoy,debt_to_assets,ocf_to_or'); }
  topList(params = {}) { return this.call('top_list', params, 'trade_date,ts_code,name,close,pct_change,turnover_rate,amount,l_sell,l_buy,l_amount,net_amount,reason'); }
  async tradeCalendar(date) { const day=String(date).replaceAll('-',''),key=`trade_cal:${day}`; const cached=await readCache(this.id,key); if(cached)return cached.payload; const guardKey=`call_guard:${key}`; if(await readCache(this.id,guardKey))throw Object.assign(new Error(`trade_cal already attempted for ${day}; daily provider limit enforced`),{code:'DAILY_CALL_LIMIT',status:429,provider:this.id,retryAfter:86400}); await writeCache(this.id,guardKey,{attemptedAt:new Date().toISOString()},{ttlMs:DAY,staleMs:DAY}); const result=await cachedLoad(this.id,key,{ttlMs:DAY,staleMs:7*DAY},()=>this.call('trade_cal',{exchange:'SSE',start_date:day,end_date:day},'exchange,cal_date,is_open,pretrade_date')); await writeCache(this.id,'health',{authenticated:true,lastSuccessfulCall:'trade_cal',checkedAt:new Date().toISOString()},{ttlMs:DAY,staleMs:7*DAY}); return result.payload; }
  async health() { if(!this.isConfigured())return{provider:this.id,configured:false,authenticated:false,healthy:false,status:'unavailable',reason:'TUSHARE_TOKEN missing'}; const cached=await readCache(this.id,'health'); if(cached)return{provider:this.id,configured:true,authenticated:true,healthy:cached.status!=='failed',status:cached.status==='fresh'&&!cached.stale?'available':'degraded',cached:true,checkedAt:cached.fetchedAt,reason:cached.error||undefined}; return{provider:this.id,configured:true,authenticated:null,healthy:true,status:'unverified',cached:false,reason:'No cached probe; health check intentionally skipped upstream call'}; }
  async probeHealth(date=new Date().toISOString().slice(0,10)) { try{await this.tradeCalendar(date);return{provider:this.id,configured:true,authenticated:true,healthy:true,status:'available',cached:false};}catch(error){const limited=['RATE_LIMITED','DAILY_CALL_LIMIT'].includes(error.code)||/没有接口.*访问权限/.test(error.message);await writeCache(this.id,'health',{authenticated:limited,error:error.message,checkedAt:new Date().toISOString()},{ttlMs:DAY,staleMs:7*DAY,status:limited?'degraded':'failed',error:error.message});return{provider:this.id,configured:true,authenticated:limited,healthy:limited,status:limited?'degraded':'unavailable',reason:error.message};} }
}
