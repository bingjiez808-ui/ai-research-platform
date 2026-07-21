BEGIN;
CREATE TABLE IF NOT EXISTS papers (
 id bigserial PRIMARY KEY, canonical_key text UNIQUE NOT NULL, title text NOT NULL, abstract text,
 publication_date date, venue text, doi text UNIQUE, citation_count integer NOT NULL DEFAULT 0,
 concepts jsonb NOT NULL DEFAULT '[]', raw jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS authors (id bigserial PRIMARY KEY, canonical_key text UNIQUE NOT NULL, name text NOT NULL, affiliations jsonb NOT NULL DEFAULT '[]', h_index integer, works_count integer, citation_count bigint, raw jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS topics (id bigserial PRIMARY KEY, canonical_key text UNIQUE NOT NULL, name text NOT NULL, description text, raw jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS models (id bigserial PRIMARY KEY, canonical_key text UNIQUE NOT NULL, name text NOT NULL, author_name text, pipeline_tag text, downloads bigint, likes integer, tags jsonb NOT NULL DEFAULT '[]', last_modified timestamptz, raw jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS paper_authors (paper_id bigint REFERENCES papers ON DELETE CASCADE, author_id bigint REFERENCES authors ON DELETE CASCADE, position integer NOT NULL DEFAULT 0, PRIMARY KEY(paper_id,author_id));
CREATE TABLE IF NOT EXISTS paper_topics (paper_id bigint REFERENCES papers ON DELETE CASCADE, topic_id bigint REFERENCES topics ON DELETE CASCADE, score real, PRIMARY KEY(paper_id,topic_id));
CREATE TABLE IF NOT EXISTS citations (citing_paper_id bigint REFERENCES papers ON DELETE CASCADE, cited_paper_id bigint REFERENCES papers ON DELETE CASCADE, source text NOT NULL, observed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(citing_paper_id,cited_paper_id,source));
CREATE TABLE IF NOT EXISTS provenance (entity_type text NOT NULL, entity_id bigint NOT NULL, provider text NOT NULL, provider_id text NOT NULL, source_url text, fetched_at timestamptz NOT NULL DEFAULT now(), payload_hash text, PRIMARY KEY(entity_type,provider,provider_id));
CREATE TABLE IF NOT EXISTS ingestion_runs (id bigserial PRIMARY KEY, provider text NOT NULL, query text, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, status text NOT NULL DEFAULT 'running', records integer NOT NULL DEFAULT 0, error text);
CREATE INDEX IF NOT EXISTS papers_publication_date_idx ON papers(publication_date);
CREATE INDEX IF NOT EXISTS papers_citations_idx ON papers(citation_count DESC);
CREATE INDEX IF NOT EXISTS authors_citations_idx ON authors(citation_count DESC);
CREATE INDEX IF NOT EXISTS citations_cited_paper_id_idx ON citations(cited_paper_id);
CREATE INDEX IF NOT EXISTS provenance_entity_idx ON provenance(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS ingestion_runs_provider_started_idx ON ingestion_runs(provider, started_at DESC);
COMMIT;
