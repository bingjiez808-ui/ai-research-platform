# AI Research Platform

React/Vite frontend plus an Express backend for market data and real academic AI research data.

## Research backend

The backend normalizes papers, authors, topics, citations, and Hugging Face models from real upstream APIs. It never substitutes mock data. Every imported entity records provider ID, URL, fetch time, and payload hash in `provenance`.

### Requirements

- Node.js 22+
- PostgreSQL 14+
- Existing dependencies plus **`pg`** (required, intentionally not added to package files in this branch)
- `DATABASE_URL` is mandatory for research APIs/scripts
- Provider keys are optional: `SEMANTIC_SCHOLAR_API_KEY`, `OPENALEX_API_KEY`, and `HUGGINGFACE_TOKEN` raise quotas/access where supported. `OPENALEX_EMAIL` and a descriptive `RESEARCH_USER_AGENT` are strongly recommended. arXiv requires no key.

Copy `.env.example` to `.env`, install `pg`, then:

```sh
node --env-file=.env scripts/migrate.js
node --env-file=.env scripts/ingest-research.js arxiv "cat:cs.AI"
node --env-file=.env scripts/ingest-research.js semantic-scholar "large language model"
node --env-file=.env scripts/ingest-research.js openalex "artificial intelligence"
node --env-file=.env scripts/ingest-research.js huggingface "text-generation"
node --env-file=.env server/index.js
```

Ingestion is repeatable: canonical keys and provider provenance use upserts. Upstream timeouts, 429s, and 5xx responses are retried with bounded exponential/`Retry-After` delays and returned as explicit errors.

### API

- `GET /api/research/papers?q=&limit=&offset=`
- `GET /api/research/papers/:id/citations`
- `GET /api/research/authors/ranking?limit=`
- `GET /api/research/trends/ai?months=24`
- `GET /api/research/topics/evolution`
- `GET /api/research/models?limit=&offset=`
- `GET /api/research/provenance/:type/:id`
- `POST /api/research/ingest/{arxiv|semantic-scholar|openalex|huggingface}` with JSON such as `{ "query": "multimodal", "limit": 50 }`

Citation edges are imported from Semantic Scholar references when the referenced paper is already known under the same provider ID. Re-running ingestion resolves additional edges as referenced papers enter the database.

## Frontend

```sh
npm run dev
```

## A-share decision workflow

- `GET /api/stocks/:code/price-history?limit=120` returns verified Eastmoney forward-adjusted daily OHLCV data with no mock fallback.
- `GET /api/decision/:code` runs the auditable Research, Market and Risk analysts, a bounded Bull/Bear evidence review, and a deterministic investment-committee guard.
- Directional suggestions are suppressed when evidence confidence or historical coverage is insufficient.

The role separation and bounded debate are inspired by
[TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents),
licensed under Apache-2.0. This project does not copy its Python implementation,
prompts, data providers, or automatic-trading behavior; the workflow is an
independent Node.js implementation adapted for A-share evidence and risk rules.
