const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

function ownerKey() {
  let key = localStorage.getItem('ai-investment-owner-key');
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem('ai-investment-owner-key', key);
  }
  return key;
}
function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key,value]) => value !== '' && value != null && search.set(key,String(value)));
  return search.size ? `?${search}` : '';
}
async function request(path,{method='GET',params,body,signal,owner=false}={}) {
  const headers={Accept:'application/json'};
  if(owner)headers['X-Owner-Key']=ownerKey();
  if(body && !(body instanceof FormData))headers['Content-Type']='application/json';
  // Dashboard data changes continuously and Render may briefly serve a stale
  // cached GET response while a new instance is coming online. Always
  // revalidate API reads so an early empty response cannot stick on the page.
  const response=await fetch(`${BASE}${path}${query(params)}`,{method,signal,headers,credentials:'include',cache:'no-store',body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||payload?.success===false)throw new Error(payload?.error?.message||payload?.message||`HTTP ${response.status}`);
  return payload;
}
export const api={
  login:data=>request('/auth/login',{method:'POST',body:data}),
  register:data=>request('/auth/register',{method:'POST',body:data}),
  me:signal=>request('/auth/me',{signal}),
  logout:()=>request('/auth/logout',{method:'POST'}),
  stocks:(params,signal)=>request('/stocks',{params,signal}),
  stock:(code,signal)=>request(`/stocks/${encodeURIComponent(code)}`,{signal}),
  priceHistory:(code,params,signal)=>request(`/stocks/${encodeURIComponent(code)}/price-history`,{params,signal}),
  decision:(code,signal)=>request(`/decision/${encodeURIComponent(code)}`,{signal}),
  trend:(params,signal)=>request('/market/trend',{params,signal}),
  marketDashboard:signal=>request('/market/dashboard',{signal}),
  marketSummary:signal=>request('/market/ai-summary',{signal}),
  marketTop10:signal=>request('/market/recommendations/top10',{signal}),
  hotSectors:signal=>request('/market/hot-sectors',{signal}),
  dailySummary:signal=>request('/daily-summary/today',{signal,owner:true}),
  marketScreener:(params,signal)=>request('/market/scans/technical',{params,signal}),
  majorEvents:signal=>request('/events/major',{signal}),
  watchlist:signal=>request('/watchlist',{signal,owner:true}),
  saveWatchlist:items=>request('/watchlist',{method:'PUT',body:{items},owner:true}),
  dailyAgentLatest:signal=>request('/daily-agent/latest',{signal,owner:true}),
  runDailyAgent:()=>request('/daily-agent/run',{method:'POST',owner:true}),
  news:(params,signal)=>request('/news',{params,signal}),
  analysis:(code,signal)=>request(`/analysis/${encodeURIComponent(code)}`,{signal}),
  commandCenter:(portfolioId,signal)=>request('/command-center',{params:{portfolioId},signal,owner:Boolean(portfolioId)}),
  portfolios:signal=>request('/portfolios',{signal,owner:true}),
  createPortfolio:data=>request('/portfolios',{method:'POST',body:typeof data==='string'?{name:data}:data,owner:true}),
  createPortfolioWithHoldings:data=>request('/portfolios/with-holdings',{method:'POST',body:data,owner:true}),
  portfolio:(id,signal)=>request(`/portfolios/${id}`,{signal,owner:true}),
  portfolioAnalysis:(id,signal)=>request(`/portfolios/${id}/analysis`,{signal,owner:true}),
  addHolding:(id,data)=>request(`/portfolios/${id}/holdings`,{method:'POST',body:data,owner:true}),
  addHoldingsBatch:(id,holdings)=>request(`/portfolios/${id}/holdings/batch`,{method:'POST',body:{holdings},owner:true}),
  previewImport:(id,file)=>{const body=new FormData();body.append('file',file);return request(`/portfolios/${id}/imports/preview`,{method:'POST',body,owner:true});},
  confirmImport:(id,importId)=>request(`/portfolios/${id}/imports/${importId}/confirm`,{method:'POST',owner:true}),
  importPortfolioOcr:(id,file)=>{const body=new FormData();body.append('image',file);return request(`/portfolios/${id}/ocr`,{method:'POST',body,owner:true});},
  latestSnapshot:(id,signal)=>request(`/portfolios/${id}/snapshots/latest`,{signal,owner:true}),
  assistant:(data)=>request('/assistant/chat',{method:'POST',body:data,owner:true}),
};
export function envelope(payload,keys=[]){const body=payload?.data??payload??{};let items=Array.isArray(body)?body:null;if(!items)for(const key of keys)if(Array.isArray(body?.[key])){items=body[key];break;}return{body,items:items||[],total:body?.total??payload?.total??items?.length??0,source:payload?.meta?.source??body?.source??null,updatedAt:payload?.meta?.updatedAt??body?.updatedAt??null};}
export { ownerKey };
