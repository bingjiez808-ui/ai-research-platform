import fs from 'fs/promises'; import path from 'path'; import { fileURLToPath } from 'url'; import { getPool } from '../server/research/db.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); const pool=await getPool();
try { for(const file of (await fs.readdir(path.join(root,'database/migrations'))).filter(x=>x.endsWith('.sql')).sort()) { await pool.query(await fs.readFile(path.join(root,'database/migrations',file),'utf8')); console.log(`applied ${file}`); } } finally { await pool.end(); }
