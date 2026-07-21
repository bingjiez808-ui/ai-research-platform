import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import { getPrisma } from '../../research/prisma.js';
import { analyzePortfolio, getPortfolio, ownerKey, upsertHolding } from './service.js';
import { confirmImport, createImportPreview, excelFileFilter, IMPORT_LIMITS } from './import-pipeline.js';
import { marketFor } from '../normalize.js';

export const portfolioRouter = Router();
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: IMPORT_LIMITS.fileBytes, files: 1, fields: 0 }, fileFilter: excelFileFilter });
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 }, fileFilter: (_req,file,done) => done(file.mimetype.startsWith('image/') ? null : Object.assign(new Error('Only image screenshots are accepted'),{status:415,code:'INVALID_IMAGE_TYPE'}), file.mimetype.startsWith('image/')) });
const uploadExcel = (req,res,next) => excelUpload.single('file')(req,res,error => {
  if (error?.code === 'LIMIT_FILE_SIZE') return next(Object.assign(new Error(`Excel file exceeds ${IMPORT_LIMITS.fileBytes} bytes`),{status:413,code:'FILE_TOO_LARGE'}));
  next(error);
});

portfolioRouter.get('/portfolios', async (req,res,next) => { try {
  const items=await getPrisma().portfolio.findMany({where:{ownerKey:ownerKey(req)},orderBy:{updatedAt:'desc'},include:{_count:{select:{holdings:true}}}});
  res.json({success:true,data:items});
} catch(error){next(error);} });
portfolioRouter.post('/portfolios', async (req,res,next) => { try {
  const name=String(req.body?.name||'').trim();
  if(!name)return res.status(400).json({success:false,error:{code:'NAME_REQUIRED',message:'Portfolio name is required'}});
  const riskPreference=['controlled','medium','high'].includes(req.body?.riskPreference)?req.body.riskPreference:'medium';
  const capital=Number(req.body?.capital);if(req.body?.capital!=null&&!(capital>0))return res.status(400).json({success:false,error:{code:'INVALID_CAPITAL',message:'资金规模必须大于 0'}});
  const data=await getPrisma().portfolio.create({data:{ownerKey:ownerKey(req),name,currency:req.body.currency||'CNY',capital:Number.isFinite(capital)?capital:null,riskPreference}});
  res.status(201).json({success:true,data});
} catch(error){next(error);} });
portfolioRouter.post('/portfolios/with-holdings',async(req,res,next)=>{try{
  const db=getPrisma(),owner=ownerKey(req),name=String(req.body?.name||'').trim(),holdings=Array.isArray(req.body?.holdings)?req.body.holdings:[];
  if(!name)return res.status(400).json({success:false,error:{code:'NAME_REQUIRED',message:'组合名称不能为空'}});if(!holdings.length||holdings.length>100)return res.status(400).json({success:false,error:{code:'INVALID_HOLDINGS',message:'持仓数量必须为 1—100 只'}});
  const capital=Number(req.body?.capital),riskPreference=['controlled','medium','high'].includes(req.body?.riskPreference)?req.body.riskPreference:'medium';if(!(capital>0))return res.status(400).json({success:false,error:{code:'INVALID_CAPITAL',message:'资金规模必须大于 0'}});
  const normalized=holdings.map(row=>({input:row,code:String(row.stockCode||'').replace(/\D/g,'').padStart(6,'0'),shares:Number(row.shares),costPrice:Number(row.costPrice),buyDate:row.buyDate?new Date(row.buyDate):null}));
  if(normalized.some(row=>!/^\d{6}$/.test(row.code)||!(row.shares>0)||!(row.costPrice>=0)||row.buyDate&&Number.isNaN(row.buyDate.getTime())))return res.status(400).json({success:false,error:{code:'INVALID_HOLDING',message:'股票代码、股数、成本价或买入日期无效'}});
  const stocks=await db.stock.findMany({where:{code:{in:[...new Set(normalized.map(row=>row.code))]}},include:{prices:{take:1,orderBy:{tradeDate:'desc'}}}}),byCode=new Map(stocks.map(stock=>[stock.code,stock])),missing=[...new Set(normalized.map(row=>row.code).filter(code=>!byCode.has(code)))];if(missing.length)return res.status(422).json({success:false,error:{code:'STOCK_NOT_INDEXED',message:`以下股票尚未进入真实证券库：${missing.join('、')}`,missing}});
  const invested=normalized.reduce((sum,row)=>sum+row.shares*row.costPrice,0);if(invested>capital)return res.status(400).json({success:false,error:{code:'CAPITAL_EXCEEDED',message:'持仓成本超过资金规模'}});
  const data=await db.$transaction(async tx=>{const portfolio=await tx.portfolio.create({data:{ownerKey:owner,name,currency:req.body.currency||'CNY',capital,riskPreference}});for(const row of normalized){const stock=byCode.get(row.code);await tx.portfolioHolding.create({data:{portfolioId:portfolio.id,stockId:stock.id,stockCode:`${row.code}.${marketFor(row.code)}`,shares:row.shares,costPrice:row.costPrice,buyDate:row.buyDate,currentValue:row.shares*Number(stock.prices[0]?.close||0),source:'guided-builder',raw:row.input}});}return tx.portfolio.findUnique({where:{id:portfolio.id},include:{holdings:{include:{stock:{select:{code:true,name:true}}}}}})});
  res.status(201).json({success:true,data,meta:{transactional:true,mock:false,source:'用户确认的组合与真实证券主数据'}});
}catch(error){next(error);}});
portfolioRouter.get('/portfolios/:id', async (req,res,next) => { try { res.json({success:true,data:await getPortfolio(req.params.id,ownerKey(req))}); } catch(error){next(error);} });
portfolioRouter.post('/portfolios/:id/holdings', async (req,res,next) => { try { res.status(201).json({success:true,data:await upsertHolding(req.params.id,ownerKey(req),req.body,'manual')}); } catch(error){next(error);} });
portfolioRouter.delete('/portfolios/:id/holdings/:holdingId', async (req,res,next) => { try {
  await getPortfolio(req.params.id,ownerKey(req));
  await getPrisma().portfolioHolding.delete({where:{id:BigInt(req.params.holdingId)}});
  res.status(204).end();
} catch(error){next(error);} });
portfolioRouter.get('/portfolios/:id/analysis', async (req,res,next) => { try {
  res.json({success:true,data:await analyzePortfolio(req.params.id,ownerKey(req)),meta:{source:'PostgreSQL real market/financial/news data',updatedAt:new Date(),mock:false}});
} catch(error){next(error);} });

async function previewHandler(req,res,next) { try {
  const owner=ownerKey(req);
  await getPortfolio(req.params.id,owner);
  const data=await createImportPreview({portfolioId:req.params.id,owner,file:req.file});
  res.status(201).json({success:true,data,meta:{stage:'preview',databaseWritten:false,limits:IMPORT_LIMITS}});
} catch(error){next(error);} }
portfolioRouter.post('/portfolios/:id/imports/preview', uploadExcel, previewHandler);
portfolioRouter.post('/portfolios/:id/import', uploadExcel, previewHandler);
portfolioRouter.post('/portfolios/:id/imports/:importId/confirm', async (req,res,next) => { try {
  const owner=ownerKey(req);
  await getPortfolio(req.params.id,owner);
  const data=await confirmImport({portfolioId:req.params.id,importId:req.params.importId,owner});
  res.json({success:true,data,meta:{stage:'confirmed',databaseWritten:true,agents:['market','research','risk']}});
} catch(error){next(error);} });
portfolioRouter.get('/portfolios/:id/imports', async (req,res,next) => { try {
  const owner=ownerKey(req);await getPortfolio(req.params.id,owner);
  const data=await getPrisma().portfolioImport.findMany({where:{portfolioId:BigInt(req.params.id),importUser:owner},orderBy:{createdAt:'desc'},take:100,select:{id:true,status:true,importUser:true,fileName:true,fileSize:true,mimeType:true,checksum:true,sheetCount:true,rowsRead:true,rowsWritten:true,validationResult:true,error:true,createdAt:true,expiresAt:true,confirmedAt:true,finishedAt:true}});
  res.json({success:true,data});
} catch(error){next(error);} });
portfolioRouter.get('/portfolios/:id/imports/:importId', async (req,res,next) => { try {
  const owner=ownerKey(req);await getPortfolio(req.params.id,owner);
  const data=await getPrisma().portfolioImport.findFirst({where:{id:BigInt(req.params.importId),portfolioId:BigInt(req.params.id),importUser:owner},include:{snapshot:true}});
  if(!data)throw Object.assign(new Error('Import not found'),{status:404,code:'IMPORT_NOT_FOUND'});
  res.json({success:true,data});
} catch(error){next(error);} });
portfolioRouter.get('/portfolios/:id/snapshots/latest', async (req,res,next) => { try {
  const owner=ownerKey(req);await getPortfolio(req.params.id,owner);
  const data=await getPrisma().portfolioSnapshot.findFirst({where:{portfolioId:BigInt(req.params.id)},orderBy:{asOf:'desc'}});
  if(!data)throw Object.assign(new Error('Portfolio snapshot not found'),{status:404,code:'SNAPSHOT_NOT_FOUND'});
  res.json({success:true,data});
} catch(error){next(error);} });

portfolioRouter.post('/portfolios/:id/ocr', imageUpload.single('image'), async (req,res,next) => {
  const db=getPrisma();let log;
  try {
    const owner=ownerKey(req);await getPortfolio(req.params.id,owner);
    if(!req.file)throw Object.assign(new Error('Portfolio screenshot is required'),{status:400});
    if(!process.env.OCR_API_URL||!process.env.OCR_API_KEY)throw Object.assign(new Error('OCR provider is not configured'),{status:503,code:'OCR_NOT_CONFIGURED'});
    log=await db.portfolioImport.create({data:{portfolioId:BigInt(req.params.id),importType:'ocr',importUser:owner,fileName:req.file.originalname,fileSize:req.file.size,mimeType:req.file.mimetype,status:'running'}});
    const image=`data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    const {data}=await axios.post(process.env.OCR_API_URL,{model:process.env.OCR_MODEL||'gpt-4.1-mini',messages:[{role:'system',content:'Extract A-share portfolio holdings. Return strict JSON: {"holdings":[{"stockCode":"000001","shares":100,"costPrice":10.5}]}. Do not infer unreadable values.'},{role:'user',content:[{type:'text',text:'Extract holdings from this screenshot.'},{type:'image_url',image_url:{url:image}}]}],response_format:{type:'json_object'}},{headers:{Authorization:`Bearer ${process.env.OCR_API_KEY}`},timeout:Number(process.env.OCR_TIMEOUT_MS||60000)});
    const content=data.choices?.[0]?.message?.content;if(!content)throw Object.assign(new Error('OCR provider returned no structured content'),{status:502,code:'OCR_INVALID_RESPONSE'});const payload=JSON.parse(content),rows=Array.isArray(payload.holdings)?payload.holdings:[],results=[];
    for(const row of rows)try{results.push({ok:true,id:String((await upsertHolding(req.params.id,owner,row,'ocr')).id),stockCode:row.stockCode});}catch(error){results.push({ok:false,stockCode:row.stockCode,error:error.message});}
    await db.portfolioImport.update({where:{id:log.id},data:{status:'succeeded',rowsRead:rows.length,rowsWritten:results.filter(result=>result.ok).length,validationResult:{valid:results.every(result=>result.ok)},result:{results,usage:data.usage||null},finishedAt:new Date()}});
    res.json({success:true,data:{rowsRead:rows.length,rowsWritten:results.filter(result=>result.ok).length,results,provider:process.env.OCR_MODEL||'configured-vision-model'},meta:{source:process.env.OCR_API_URL,url:process.env.OCR_API_URL,fetchedAt:new Date(),status:'live',mock:false}});
  } catch(error) {
    if(log)await db.portfolioImport.update({where:{id:log.id},data:{status:'failed',error:error.message,finishedAt:new Date()}}).catch(()=>{});
    next(error);
  }
});
