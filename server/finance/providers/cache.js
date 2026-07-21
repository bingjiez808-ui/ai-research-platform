import crypto from 'crypto';
import { getPrisma } from '../../research/prisma.js';
import { getPool } from '../../research/db.js';

const lockId = value => crypto.createHash('sha256').update(value).digest().readInt32BE(0);
export async function readCache(provider, cacheKey, { allowStale = true } = {}) {
  const db=getPrisma(), now=new Date(); const row=await db.providerCache.findUnique({where:{provider_cacheKey:{provider,cacheKey}}}); if(!row)return null;
  const fresh=row.expiresAt>now, usable=fresh||(allowStale&&row.staleUntil>now); if(!usable)return null;
  await db.providerCache.update({where:{id:row.id},data:{hitCount:{increment:1}}}).catch(()=>{});
  return {payload:row.payload,fresh,stale:!fresh,fetchedAt:row.fetchedAt,expiresAt:row.expiresAt,status:row.status,error:row.error};
}
export async function writeCache(provider,cacheKey,payload,{ttlMs,staleMs=ttlMs*3,status='fresh',error=null}={}){const db=getPrisma(),now=new Date();return db.providerCache.upsert({where:{provider_cacheKey:{provider,cacheKey}},create:{provider,cacheKey,payload,fetchedAt:now,expiresAt:new Date(now.getTime()+ttlMs),staleUntil:new Date(now.getTime()+staleMs),status,error},update:{payload,fetchedAt:now,expiresAt:new Date(now.getTime()+ttlMs),staleUntil:new Date(now.getTime()+staleMs),status,error}});}
export async function cachedLoad(provider,cacheKey,{ttlMs,staleMs=ttlMs*3,force=false},loader){if(!force){const cached=await readCache(provider,cacheKey);if(cached?.fresh)return {...cached,source:'cache'};}
  const pool=await getPool(),client=await pool.connect(),key=lockId(`provider-cache:${provider}:${cacheKey}`);try{const {rows:[locked]}=await client.query('SELECT pg_try_advisory_lock($1) acquired',[key]);if(!locked.acquired){const cached=await readCache(provider,cacheKey);if(cached)return {...cached,source:'cache-wait'};throw Object.assign(new Error(`Cache refresh in progress: ${provider}/${cacheKey}`),{code:'CACHE_REFRESH_IN_PROGRESS',status:503});}
    if(!force){const cached=await readCache(provider,cacheKey);if(cached?.fresh)return {...cached,source:'cache'};}
    try{const payload=await loader();await writeCache(provider,cacheKey,payload,{ttlMs,staleMs});return{payload,fresh:true,stale:false,fetchedAt:new Date(),source:'upstream'};}catch(error){const stale=await readCache(provider,cacheKey,{allowStale:true});if(stale)return{...stale,stale:true,status:'stale-if-error',error:error.message,source:'stale-cache'};throw error;}
  }finally{await client.query('SELECT pg_advisory_unlock($1)',[key]).catch(()=>{});client.release();}}
