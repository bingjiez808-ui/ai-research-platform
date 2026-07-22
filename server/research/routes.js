import express from 'express';
import { query } from './db.js';
import { ingest } from './ingest.js';
import { requireAdminToken } from '../security.js';

export const researchRouter = express.Router();
const paging = q => ({ limit: Math.min(Math.max(Number(q.limit) || 20, 1), 100), offset: Math.max(Number(q.offset) || 0, 0) });
const meta = source => ({ source, updatedAt: new Date().toISOString() });

researchRouter.get('/overview', async (_req, res, next) => {
  try {
    const [metrics, recent, providers] = await Promise.all([
      query(`SELECT (SELECT count(*)::int FROM papers) papers,(SELECT count(*)::int FROM authors) authors,(SELECT count(*)::int FROM citations) citations,(SELECT count(*)::int FROM models) models`),
      query(`SELECT p.id,p.title,p.publication_date,p.venue,p.citation_count,COALESCE(json_agg(jsonb_build_object('id',a.id,'name',a.name) ORDER BY pa.position) FILTER(WHERE a.id IS NOT NULL),'[]') authors FROM papers p LEFT JOIN paper_authors pa ON pa.paper_id=p.id LEFT JOIN authors a ON a.id=pa.author_id GROUP BY p.id ORDER BY p.publication_date DESC NULLS LAST LIMIT 6`),
      query(`SELECT DISTINCT ON(provider) provider,status,records,finished_at FROM ingestion_runs ORDER BY provider,started_at DESC`),
    ]);
    res.json({ data: { metrics: metrics.rows[0], recentPapers: recent.rows, providers: providers.rows, updatedAt: new Date().toISOString() }, meta: meta('PostgreSQL research index') });
  } catch (error) { next(error); }
});

researchRouter.get('/papers', async (req, res, next) => {
  try {
    const { limit, offset } = paging(req.query); const search = req.query.q || null;
    const [rows, count] = await Promise.all([
      query(`SELECT p.*,COALESCE(json_agg(jsonb_build_object('id',a.id,'name',a.name) ORDER BY pa.position) FILTER(WHERE a.id IS NOT NULL),'[]') authors FROM papers p LEFT JOIN paper_authors pa ON pa.paper_id=p.id LEFT JOIN authors a ON a.id=pa.author_id WHERE ($1::text IS NULL OR p.title ILIKE '%'||$1||'%' OR p.abstract ILIKE '%'||$1||'%') GROUP BY p.id ORDER BY publication_date DESC NULLS LAST LIMIT $2 OFFSET $3`, [search, limit, offset]),
      query(`SELECT count(*)::int total FROM papers WHERE ($1::text IS NULL OR title ILIKE '%'||$1||'%' OR abstract ILIKE '%'||$1||'%')`, [search]),
    ]);
    res.json({ data: rows.rows, total: count.rows[0].total, limit, offset, meta: meta('Normalized arXiv, Semantic Scholar and OpenAlex records') });
  } catch (error) { next(error); }
});

researchRouter.get('/citations', async (req, res, next) => {
  try { const { limit, offset } = paging(req.query); const result = await query(`SELECT p.id,p.title,p.venue,p.publication_date,p.citation_count,count(c.citing_paper_id)::int resolved_citations FROM papers p LEFT JOIN citations c ON c.cited_paper_id=p.id GROUP BY p.id ORDER BY p.citation_count DESC,resolved_citations DESC LIMIT $1 OFFSET $2`, [limit, offset]); res.json({ data: result.rows, meta: meta('Semantic Scholar and OpenAlex citation metadata') }); } catch (error) { next(error); }
});

researchRouter.get('/papers/:id/citations', async (req, res, next) => {
  try { const result = await query(`SELECT p.*,c.source,c.observed_at FROM citations c JOIN papers p ON p.id=c.citing_paper_id WHERE c.cited_paper_id=$1 ORDER BY p.publication_date DESC`, [req.params.id]); res.json({ data: result.rows, meta: meta('Resolved local citation graph') }); } catch (error) { next(error); }
});

researchRouter.get('/authors/ranking', async (req, res, next) => {
  try { const { limit } = paging(req.query); const result = await query(`SELECT a.id,a.name,a.affiliations,COUNT(DISTINCT pa.paper_id)::int paper_count,COALESCE(SUM(p.citation_count),0)::bigint citation_count FROM authors a LEFT JOIN paper_authors pa ON pa.author_id=a.id LEFT JOIN papers p ON p.id=pa.paper_id GROUP BY a.id ORDER BY citation_count DESC,paper_count DESC LIMIT $1`, [limit]); res.json({ data: result.rows, meta: meta('Indexed paper and citation aggregates') }); } catch (error) { next(error); }
});

researchRouter.get('/trends/ai', async (req, res, next) => {
  try { const months = Math.min(Math.max(Number(req.query.months) || 24, 1), 120); const result = await query(`SELECT date_trunc('month',publication_date)::date period,COUNT(*)::int papers,COALESCE(SUM(citation_count),0)::bigint citations FROM papers WHERE publication_date >= CURRENT_DATE-($1::int*interval '1 month') GROUP BY 1 ORDER BY 1`, [months]); res.json({ data: result.rows, meta: meta('Monthly aggregates from indexed papers') }); } catch (error) { next(error); }
});

researchRouter.get('/topics/evolution', async (_req, res, next) => {
  try { const result = await query(`SELECT t.id,t.name,date_trunc('year',p.publication_date)::date period,COUNT(*)::int papers,AVG(pt.score) score FROM topics t JOIN paper_topics pt ON pt.topic_id=t.id JOIN papers p ON p.id=pt.paper_id WHERE p.publication_date IS NOT NULL GROUP BY t.id,t.name,period ORDER BY period,t.name`); res.json({ data: result.rows, meta: meta('Normalized source topics by publication year') }); } catch (error) { next(error); }
});

researchRouter.get('/models', async (req, res, next) => {
  try { const { limit, offset } = paging(req.query); const result = await query('SELECT * FROM models ORDER BY downloads DESC NULLS LAST LIMIT $1 OFFSET $2', [limit, offset]); res.json({ data: result.rows, limit, offset, meta: meta('HuggingFace Hub') }); } catch (error) { next(error); }
});

researchRouter.post('/ingest/:provider', async (req, res, next) => {
  try { requireAdminToken(req, 'RESEARCH_INGEST_TOKEN'); res.status(202).json({ data: await ingest(req.params.provider, req.body || {}) }); } catch (error) { next(error); }
});

researchRouter.get('/provenance/:type/:id', async (req, res, next) => {
  try { const result = await query('SELECT provider,provider_id,source_url,fetched_at,payload_hash FROM provenance WHERE entity_type=$1 AND entity_id=$2 ORDER BY fetched_at DESC', [req.params.type, req.params.id]); res.json({ data: result.rows }); } catch (error) { next(error); }
});
