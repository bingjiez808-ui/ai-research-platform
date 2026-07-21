let pool;
export async function getPool() {
  if (!process.env.DATABASE_URL) throw Object.assign(new Error('DATABASE_URL is required for research APIs'), { status: 503, code: 'DATABASE_NOT_CONFIGURED' });
  if (!pool) {
    let pg;
    try { pg = await import('pg'); } catch { throw Object.assign(new Error('Research backend requires the "pg" package'), { status: 503, code: 'PG_DEPENDENCY_MISSING' }); }
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.PG_POOL_MAX || 10), ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
  }
  return pool;
}
export async function query(text, params) { return (await getPool()).query(text, params); }
export async function transaction(fn) { const c = await (await getPool()).connect(); try { await c.query('BEGIN'); const v = await fn(c); await c.query('COMMIT'); return v; } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } }
