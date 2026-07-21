import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Router } from 'express';
import { getPrisma } from './research/prisma.js';

const scrypt=promisify(scryptCallback), COOKIE='aip_session', TTL=30*86400000;
const limits=new Map();
const hash=value=>createHash('sha256').update(value).digest('hex');
const cookies=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2));
const publicUser=user=>({id:user.id,email:user.email,displayName:user.displayName,createdAt:user.createdAt});
function rateLimit(req,key,max,windowMs){const now=Date.now(),id=`${req.ip}:${key}`,entry=limits.get(id);if(!entry||entry.reset<=now){limits.set(id,{count:1,reset:now+windowMs});return;}if(++entry.count>max)throw Object.assign(new Error('Too many requests; try again later'),{status:429,code:'RATE_LIMITED'});}
async function derive(password,salt){return (await scrypt(password,Buffer.from(salt,'hex'),64,{N:16384,r:8,p:1})).toString('hex');}
function setCookie(res,token,maxAge=TTL){res.append('Set-Cookie',`${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge/1000)}${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);}
async function newSession(userId,res){const token=randomBytes(32).toString('base64url');await getPrisma().userSession.create({data:{userId,tokenHash:hash(token),expiresAt:new Date(Date.now()+TTL)}});setCookie(res,token);}

export async function sessionMiddleware(req,_res,next){try{const token=cookies(req)[COOKIE];if(token){const session=await getPrisma().userSession.findUnique({where:{tokenHash:hash(token)},include:{user:true}});if(session&&session.expiresAt>new Date()){req.user=session.user;req.session=session;getPrisma().userSession.update({where:{id:session.id},data:{lastSeenAt:new Date()}}).catch(()=>{});}else if(session)await getPrisma().userSession.delete({where:{id:session.id}}).catch(()=>{});}next();}catch(error){next(error);}}

export const authRouter=Router();
authRouter.post('/auth/register',async(req,res,next)=>{try{rateLimit(req,'register',5,15*60000);const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||''),displayName=String(req.body?.displayName||'').trim().slice(0,80)||null;if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<10||password.length>200)throw Object.assign(new Error('Invalid email or password (10–200 characters required)'),{status:400,code:'INVALID_CREDENTIALS'});const salt=randomBytes(16).toString('hex'),passwordHash=await derive(password,salt);let user;try{user=await getPrisma().localUser.create({data:{email,displayName,passwordHash,passwordSalt:salt}});}catch(error){if(error.code==='P2002')throw Object.assign(new Error('Unable to register with those credentials'),{status:409,code:'ACCOUNT_UNAVAILABLE'});throw error;}await newSession(user.id,res);res.status(201).json({success:true,data:{user:publicUser(user)}});}catch(e){next(e);}});
authRouter.post('/auth/login',async(req,res,next)=>{try{rateLimit(req,'login',10,15*60000);const email=String(req.body?.email||'').trim().toLowerCase(),password=String(req.body?.password||'');const user=await getPrisma().localUser.findUnique({where:{email}});let valid=false;if(user){const actual=Buffer.from(await derive(password,user.passwordSalt),'hex'),expected=Buffer.from(user.passwordHash,'hex');valid=actual.length===expected.length&&timingSafeEqual(actual,expected);}if(!valid)throw Object.assign(new Error('Invalid email or password'),{status:401,code:'INVALID_CREDENTIALS'});await newSession(user.id,res);res.json({success:true,data:{user:publicUser(user)}});}catch(e){next(e);}});
authRouter.post('/auth/logout',async(req,res,next)=>{try{if(req.session)await getPrisma().userSession.delete({where:{id:req.session.id}});setCookie(res,'',0);res.status(204).end();}catch(e){next(e);}});
authRouter.get('/auth/me',(req,res)=>req.user?res.json({success:true,data:{user:publicUser(req.user)}}):res.status(401).json({success:false,error:{code:'UNAUTHENTICATED',message:'Not signed in'}}));
