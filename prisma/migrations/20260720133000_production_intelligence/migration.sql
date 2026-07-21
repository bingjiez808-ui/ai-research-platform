CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "news_articles"
  ADD COLUMN "cleaned_content" TEXT,
  ADD COLUMN "classification" TEXT,
  ADD COLUMN "embedding_model" TEXT,
  ADD COLUMN "embedding" vector(1536);

ALTER TABLE "ai_analyses"
  ADD COLUMN "trace" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "confidence" DECIMAL(6,4),
  ADD COLUMN "model" TEXT,
  ADD COLUMN "input_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "output_tokens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "cost_usd" DECIMAL(14,8) NOT NULL DEFAULT 0;

CREATE TABLE "analysis_citations" (
  "id" BIGSERIAL PRIMARY KEY,
  "analysis_id" BIGINT NOT NULL REFERENCES "ai_analyses"("id") ON DELETE CASCADE,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "title" TEXT,
  "url" TEXT,
  "quoted_data" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "analysis_citations_analysis_id_idx" ON "analysis_citations"("analysis_id");

CREATE TABLE "news_clusters" (
  "id" BIGSERIAL PRIMARY KEY,
  "cluster_key" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "keywords" JSONB NOT NULL DEFAULT '[]',
  "article_count" INTEGER NOT NULL DEFAULT 0,
  "sentiment" DECIMAL(6,4),
  "first_seen_at" TIMESTAMP(3) NOT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "news_clusters_last_seen_at_idx" ON "news_clusters"("last_seen_at" DESC);

CREATE TABLE "news_cluster_members" (
  "cluster_id" BIGINT NOT NULL REFERENCES "news_clusters"("id") ON DELETE CASCADE,
  "article_id" BIGINT NOT NULL REFERENCES "news_articles"("id") ON DELETE CASCADE,
  "similarity" DECIMAL(6,4),
  PRIMARY KEY ("cluster_id", "article_id")
);

CREATE TABLE "events" (
  "id" BIGSERIAL PRIMARY KEY,
  "event_key" TEXT NOT NULL UNIQUE,
  "article_id" BIGINT REFERENCES "news_articles"("id") ON DELETE SET NULL,
  "event_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "entities" JSONB NOT NULL DEFAULT '[]',
  "industries" JSONB NOT NULL DEFAULT '[]',
  "sentiment" DECIMAL(6,4),
  "confidence" DECIMAL(6,4),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "events_occurred_at_idx" ON "events"("occurred_at" DESC);

CREATE TABLE "event_impacts" (
  "id" BIGSERIAL PRIMARY KEY,
  "event_id" BIGINT NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
  "stock_id" BIGINT NOT NULL REFERENCES "stocks"("id") ON DELETE CASCADE,
  "window" TEXT NOT NULL,
  "pre_price" DECIMAL(20,4),
  "post_price" DECIMAL(20,4),
  "benchmark_return" DECIMAL(12,6),
  "stock_return" DECIMAL(12,6),
  "abnormal_return" DECIMAL(12,6),
  "impact_score" DECIMAL(8,4) NOT NULL,
  "confidence" DECIMAL(6,4) NOT NULL,
  "method" TEXT NOT NULL,
  "evidence" JSONB NOT NULL DEFAULT '[]',
  "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("event_id", "stock_id", "window")
);
CREATE INDEX "event_impacts_stock_id_calculated_at_idx" ON "event_impacts"("stock_id", "calculated_at" DESC);

CREATE TABLE "job_executions" (
  "id" BIGSERIAL PRIMARY KEY,
  "job_name" TEXT NOT NULL,
  "scheduled_at" TIMESTAMP(3) NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'running',
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "lock_key" TEXT NOT NULL,
  "result" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT
);
CREATE INDEX "job_executions_job_name_started_at_idx" ON "job_executions"("job_name", "started_at" DESC);
