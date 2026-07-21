import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import { getPrisma } from '../../research/prisma.js';
import { analyzePortfolio, getPortfolio, ownerKey, upsertHolding } from './service.js';
import { confirmImport, createImportPreview, excelFileFilter, IMPORT_LIMITS } from './import-pipeline.js';

export const portfolioRouter = Router();
const excelUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: IMPORT_LIMITS.fileBytes, files: 1, fields: 0 }, fileFilter: excelFileFilter });
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });
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
  const data=await getPrisma().portfolio.create({data:{ownerKey:ownerKey(req),name,currency:req.body.currency||'CNY'}});
  res.status(201).json({success:true,data});
} catch(error){next(error);} });
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
    const payload=JSON.parse(data.choices?.[0]?.message?.content),rows=payload.holdings||[],results=[];
    for(const row of rows)try{results.push({ok:true,id:String((await upsertHolding(req.params.id,owner,row,'ocr')).id),stockCode:row.stockCode});}catch(error){results.push({ok:false,stockCode:row.stockCode,error:error.message});}
    await db.portfolioImport.update({where:{id:log.id},data:{status:'succeeded',rowsRead:rows.length,rowsWritten:results.filter(result=>result.ok).length,validationResult:{valid:results.every(result=>result.ok)},result:{results,usage:data.usage||null},finishedAt:new Date()}});
    res.json({success:true,data:{rowsRead:rows.length,rowsWritten:results.filter(result=>result.ok).length,results,provider:process.env.OCR_MODEL||'configured-vision-model'}});
  } catch(error) {
    if(log)await db.portfolioImport.update({where:{id:log.id},data:{status:'failed',error:error.message,finishedAt:new Date()}}).catch(()=>{});
    next(error);
  }
});
