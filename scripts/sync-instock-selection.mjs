const base=String(process.env.INSTOCK_BASE_URL||'http://localhost:9988').replace(/\/$/,'');
const target=String(process.env.INSTOCK_SYNC_TARGET||'http://localhost:3001').replace(/\/$/,'');
const token=process.env.INSTOCK_SYNC_TOKEN;
if(!token)throw new Error('INSTOCK_SYNC_TOKEN is required');
const paths=['/instock/data?table_name=cn_stock_selection','/instock/api_data?name=cn_stock_selection'];
let payload,lastError;
for(const path of paths){try{const response=await fetch(`${base}${path}`,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);payload=await response.json();break;}catch(error){lastError=error;}}
if(!payload)throw new Error(`InStock is unavailable at ${base}: ${lastError?.message}`);
const response=await fetch(`${target}/api/internal/instock/selection-sync`,{method:'POST',headers:{'content-type':'application/json','x-instock-sync-token':token},body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
if(!response.ok)throw new Error(`Cloud sync failed: HTTP ${response.status} ${await response.text()}`);
const result=await response.json();
console.log(JSON.stringify(result.data,null,2));
