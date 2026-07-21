import crypto from 'node:crypto';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { getPrisma } from '../../research/prisma.js';
import { cleanCode, marketFor } from '../normalize.js';
import { runProductionAgent } from '../agents/production.js';
import { analyzePortfolio } from './service.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
export const IMPORT_LIMITS = Object.freeze({
  fileBytes: Number(process.env.PORTFOLIO_IMPORT_MAX_FILE_BYTES || 5 * 1024 * 1024),
  sheets: Number(process.env.PORTFOLIO_IMPORT_MAX_SHEETS || 3),
  rows: Number(process.env.PORTFOLIO_IMPORT_MAX_ROWS || 2000),
  parseTimeoutMs: Number(process.env.PORTFOLIO_IMPORT_PARSE_TIMEOUT_MS || 15000),
  previewTtlMinutes: Number(process.env.PORTFOLIO_IMPORT_PREVIEW_TTL_MINUTES || 30),
  agentStocks: Number(process.env.PORTFOLIO_IMPORT_AGENT_MAX_STOCKS || 20),
});
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const aliases = {
  stockCode: ['stockCode', '股票代码', '证券代码', '代码'],
  stockName: ['stockName', '股票名称', '证券名称', '名称'],
  shares: ['shares', '持仓数量', '股份余额', '数量'],
  costPrice: ['costPrice', '成本价格', '成本价', '持仓成本'],
  buyDate: ['buyDate', '买入日期', '购入日期'],
};
const pick = (row, names) => names.find(name => Object.hasOwn(row, name)) ? row[names.find(name => Object.hasOwn(row, name))] : null;
const canonicalCode = value => { const code=cleanCode(value),market=marketFor(code); return { code, canonical:`${code}.${market}` }; };

export function excelFileFilter(_req, file, callback) {
  const validMime=file.mimetype===MIME,validExtension=path.extname(file.originalname).toLowerCase()==='.xlsx';
  if (!validMime || !validExtension) return callback(Object.assign(new Error('Only non-macro .xlsx files are accepted'),{status:415,code:'INVALID_EXCEL_TYPE'}));
  callback(null,true);
}
export function validateFile(file) {
  if (!file) throw Object.assign(new Error('Excel file is required'),{status:400,code:'FILE_REQUIRED'});
  if (file.size<=0 || file.size>IMPORT_LIMITS.fileBytes) throw Object.assign(new Error(`Excel file must be between 1 byte and ${IMPORT_LIMITS.fileBytes} bytes`),{status:413,code:'FILE_TOO_LARGE'});
  if (file.mimetype!==MIME || path.extname(file.originalname).toLowerCase()!=='.xlsx') throw Object.assign(new Error('Only non-macro .xlsx files are accepted'),{status:415,code:'INVALID_EXCEL_TYPE'});
  if (file.buffer.length<4 || file.buffer[0]!==0x50 || file.buffer[1]!==0x4b || file.buffer[2]!==0x03 || file.buffer[3]!==0x04) throw Object.assign(new Error('File signature is not a valid XLSX/ZIP container'),{status:415,code:'INVALID_FILE_SIGNATURE'});
  return crypto.createHash('sha256').update(file.buffer).digest('hex');
}
export function parseWorkbook(buffer) {
  return new Promise((resolve,reject)=>{
    const worker=new Worker(path.join(dirname,'excel-preview-worker.js'),{workerData:{buffer,maxSheets:IMPORT_LIMITS.sheets,maxRows:IMPORT_LIMITS.rows},transferList:[buffer.buffer],resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32,stackSizeMb:4}});
    const timer=setTimeout(()=>{worker.terminate();reject(Object.assign(new Error(`Excel parsing exceeded ${IMPORT_LIMITS.parseTimeoutMs}ms`),{status:408,code:'EXCEL_PARSE_TIMEOUT'}));},IMPORT_LIMITS.parseTimeoutMs);
    worker.once('message',message=>{clearTimeout(timer);worker.terminate();if(message.ok)resolve(message.data);else reject(Object.assign(new Error(message.error),{status:422,code:'EXCEL_PARSE_FAILED'}));});
    worker.once('error',error=>{clearTimeout(timer);reject(Object.assign(error,{status:422,code:'EXCEL_PARSE_FAILED'}));});
    worker.once('exit',code=>{if(code!==0){clearTimeout(timer);reject(Object.assign(new Error(`Excel parser worker exited with code ${code}`),{status:422,code:'EXCEL_PARSE_FAILED'}));}});
  });
}
function normalizeDate(value) {
  if (value==null || value==='') return null;
  const date=new Date(value); if(Number.isNaN(date.valueOf()))throw new Error('买入日期格式无效');
  const today=new Date();today.setHours(23,59,59,999);if(date>today)throw new Error('买入日期不能晚于今天');
  if(date<new Date('1990-01-01'))throw new Error('买入日期早于允许范围');
  return date.toISOString().slice(0,10);
}
export async function validateRows(rows) {
  const normalized=rows.map((row,index)=>{const errors=[];let code,canonical;try{({code,canonical}=canonicalCode(pick(row,aliases.stockCode)));}catch{errors.push('股票代码无效');}const stockName=String(pick(row,aliases.stockName)||'').trim().slice(0,100)||null,shares=Number(pick(row,aliases.shares)),costPrice=Number(pick(row,aliases.costPrice));let buyDate=null;try{buyDate=normalizeDate(pick(row,aliases.buyDate));}catch(error){errors.push(error.message);}if(!Number.isFinite(shares)||shares<=0||shares>1e12)errors.push('持仓数量必须大于 0 且不超过 1e12');if(!Number.isFinite(costPrice)||costPrice<0||costPrice>1e8)errors.push('成本价格必须在 0 到 1e8 之间');return{rowNumber:index+2,stockCode:canonical||null,databaseCode:code||null,stockName,shares:Number.isFinite(shares)?shares:null,costPrice:Number.isFinite(costPrice)?costPrice:null,buyDate,valid:errors.length===0,errors};});
  const duplicates=new Set(),seen=new Set();for(const row of normalized)if(row.databaseCode){if(seen.has(row.databaseCode))duplicates.add(row.databaseCode);seen.add(row.databaseCode);}for(const row of normalized)if(duplicates.has(row.databaseCode)){row.valid=false;row.errors.push('文件中存在重复股票代码');}
  const codes=[...new Set(normalized.filter(row=>row.valid).map(row=>row.databaseCode))],stocks=codes.length?await getPrisma().stock.findMany({where:{code:{in:codes}},select:{code:true,name:true}}):[],byCode=new Map(stocks.map(stock=>[stock.code,stock]));for(const row of normalized)if(row.valid){const stock=byCode.get(row.databaseCode);if(!stock){row.valid=false;row.errors.push('股票未在真实行情数据库中建立索引');}else if(row.stockName&&row.stockName!==stock.name){row.errors.push(`股票名称与数据库不一致（数据库：${stock.name}）`);row.valid=false;}else row.stockName=stock.name;}
  return normalized;
}
export async function createImportPreview({portfolioId,owner,file}) {
  const db=getPrisma(),checksum=validateFile(file),parsed=await parseWorkbook(file.buffer),rows=await validateRows(parsed.rows),validRows=rows.filter(row=>row.valid).length,errors=rows.flatMap(row=>row.errors.map(message=>({rowNumber:row.rowNumber,message}))),expiresAt=new Date(Date.now()+IMPORT_LIMITS.previewTtlMinutes*60000);
  const record=await db.portfolioImport.create({data:{portfolioId:BigInt(portfolioId),importType:'excel',importUser:owner,status:errors.length?'validation_failed':'preview_ready',fileName:path.basename(file.originalname).slice(0,255),fileSize:file.size,mimeType:file.mimetype,checksum,sheetCount:parsed.sheetCount,rowsRead:rows.length,validationResult:{valid:errors.length===0,validRows,invalidRows:rows.length-validRows,errors,limits:IMPORT_LIMITS},previewRows:rows,result:{sheetName:parsed.sheetName},expiresAt,finishedAt:errors.length?new Date():null}});
  return{importId:String(record.id),status:record.status,file:{name:record.fileName,size:record.fileSize,checksum},sheetCount:record.sheetCount,rowsRead:record.rowsRead,validRows,invalidRows:rows.length-validRows,preview:rows,expiresAt};
}
async function agentSnapshot(portfolioId,owner,importId) {
  const db=getPrisma(),analysis=await analyzePortfolio(portfolioId,owner),snapshot=await db.portfolioSnapshot.create({data:{portfolioId:BigInt(portfolioId),importId:BigInt(importId),totalValue:analysis.performance.totalValue,totalCost:analysis.performance.totalCost,pnl:analysis.performance.pnl,pnlPercent:analysis.performance.pnlPct,industryExposure:analysis.industryExposure,concentrationRisk:{score:analysis.risk.score,level:analysis.risk.level,maxPositionWeight:analysis.risk.maxPositionWeight},newsRisk:{negativeNews:analysis.risk.negativeNews},recommendations:analysis.rebalance,citations:analysis.citations,status:'running'}});
  const selected=[...analysis.holdings].sort((a,b)=>b.weight-a.weight).slice(0,IMPORT_LIMITS.agentStocks),agentRuns=[];
  try{for(const holding of selected)for(const agent of ['market','research','risk']){try{const result=await runProductionAgent(agent,cleanCode(holding.stockCode));agentRuns.push({agent,stockCode:holding.stockCode,status:'succeeded',analysisId:String(result.id),summary:result.summary,confidence:result.confidence});}catch(error){agentRuns.push({agent,stockCode:holding.stockCode,status:'failed',error:error.message});}}const failed=agentRuns.filter(run=>run.status==='failed').length;return await db.portfolioSnapshot.update({where:{id:snapshot.id},data:{agentRuns,status:failed?'partial':'succeeded',error:failed?`${failed} agent runs failed`:null,completedAt:new Date()}});}catch(error){await db.portfolioSnapshot.update({where:{id:snapshot.id},data:{status:'failed',error:error.message,completedAt:new Date()}});throw error;}
}
export async function confirmImport({portfolioId,importId,owner}) {
  const db=getPrisma(),now=new Date();
  const outcome=await db.$transaction(async tx=>{const item=await tx.portfolioImport.findFirst({where:{id:BigInt(importId),portfolioId:BigInt(portfolioId),importUser:owner}});if(!item)throw Object.assign(new Error('Import preview not found'),{status:404,code:'IMPORT_NOT_FOUND'});if(item.status==='confirmed'){const snapshot=await tx.portfolioSnapshot.findUnique({where:{importId:item.id}});return{alreadyConfirmed:true,item,snapshot};}if(item.status!=='preview_ready')throw Object.assign(new Error(`Import cannot be confirmed from status ${item.status}`),{status:409,code:'IMPORT_NOT_CONFIRMABLE'});if(!item.expiresAt||item.expiresAt<=now){await tx.portfolioImport.update({where:{id:item.id},data:{status:'expired',error:'Preview confirmation window expired',finishedAt:now}});throw Object.assign(new Error('Import preview has expired'),{status:410,code:'IMPORT_EXPIRED'});}const rows=Array.isArray(item.previewRows)?item.previewRows:[];if(!rows.length||rows.some(row=>!row.valid))throw Object.assign(new Error('All preview rows must pass validation before confirmation'),{status:422,code:'IMPORT_VALIDATION_FAILED'});const stocks=await tx.stock.findMany({where:{code:{in:rows.map(row=>row.databaseCode)}},include:{prices:{take:1,orderBy:{tradeDate:'desc'}}}}),byCode=new Map(stocks.map(stock=>[stock.code,stock]));for(const row of rows){const stock=byCode.get(row.databaseCode);if(!stock)throw Object.assign(new Error(`Stock ${row.stockCode} is no longer available`),{status:409,code:'STOCK_NOT_INDEXED'});const currentValue=row.shares*Number(stock.prices[0]?.close||0);await tx.portfolioHolding.upsert({where:{portfolioId_stockId:{portfolioId:BigInt(portfolioId),stockId:stock.id}},create:{portfolioId:BigInt(portfolioId),stockId:stock.id,stockCode:row.stockCode,shares:row.shares,costPrice:row.costPrice,buyDate:row.buyDate?new Date(row.buyDate):null,currentValue,source:'excel',raw:{importId:String(item.id),rowNumber:row.rowNumber,stockName:row.stockName}},update:{stockCode:row.stockCode,shares:row.shares,costPrice:row.costPrice,buyDate:row.buyDate?new Date(row.buyDate):null,currentValue,source:'excel',raw:{importId:String(item.id),rowNumber:row.rowNumber,stockName:row.stockName}}});}const updated=await tx.portfolioImport.update({where:{id:item.id},data:{status:'confirmed',rowsWritten:rows.length,confirmedAt:now,finishedAt:now,result:{confirmed:true,rowsImported:rows.length}}});return{alreadyConfirmed:false,item:updated};},{isolationLevel:'Serializable'});
  if(outcome.alreadyConfirmed)return{importId:String(outcome.item.id),status:'confirmed',alreadyConfirmed:true,snapshot:outcome.snapshot};
  const snapshot=await agentSnapshot(portfolioId,owner,importId);return{importId:String(outcome.item.id),status:'confirmed',alreadyConfirmed:false,rowsImported:outcome.item.rowsWritten,snapshot};
}
