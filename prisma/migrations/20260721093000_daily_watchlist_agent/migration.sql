CREATE TABLE "user_watchlist_stocks" (
  "id" BIGSERIAL PRIMARY KEY, "owner_key" TEXT NOT NULL, "stock_id" BIGINT NOT NULL,
  "note" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_watchlist_stocks_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "user_watchlist_stocks_owner_key_stock_id_key" ON "user_watchlist_stocks"("owner_key","stock_id");
CREATE INDEX "user_watchlist_stocks_owner_key_created_at_idx" ON "user_watchlist_stocks"("owner_key","created_at" DESC);

CREATE TABLE "daily_agent_runs" (
  "id" BIGSERIAL PRIMARY KEY, "owner_key" TEXT NOT NULL, "run_date" DATE NOT NULL, "trigger" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'running', "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3), "source_status" JSONB NOT NULL DEFAULT '[]', "error" TEXT
);
CREATE UNIQUE INDEX "daily_agent_runs_owner_key_run_date_key" ON "daily_agent_runs"("owner_key","run_date");
CREATE INDEX "daily_agent_runs_run_date_status_idx" ON "daily_agent_runs"("run_date" DESC,"status");

CREATE TABLE "daily_agent_reports" (
  "id" BIGSERIAL PRIMARY KEY, "run_id" BIGINT NOT NULL, "stock_id" BIGINT, "report_type" TEXT NOT NULL DEFAULT 'stock',
  "title" TEXT NOT NULL, "summary" TEXT NOT NULL, "recommendation" TEXT, "confidence" DECIMAL(6,4),
  "content" JSONB NOT NULL, "sources" JSONB NOT NULL DEFAULT '[]', "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "daily_agent_reports_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "daily_agent_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "daily_agent_reports_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE SET NULL
);
CREATE INDEX "daily_agent_reports_run_id_generated_at_idx" ON "daily_agent_reports"("run_id","generated_at" DESC);
CREATE INDEX "daily_agent_reports_stock_id_generated_at_idx" ON "daily_agent_reports"("stock_id","generated_at" DESC);

CREATE TABLE "major_financial_events" (
  "id" BIGSERIAL PRIMARY KEY, "canonical_key" TEXT NOT NULL, "category" TEXT NOT NULL, "title" TEXT NOT NULL,
  "summary" TEXT, "published_at" TIMESTAMP(3) NOT NULL, "source_name" TEXT NOT NULL, "source_url" TEXT NOT NULL,
  "article_url" TEXT NOT NULL, "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retrieval_status" TEXT NOT NULL DEFAULT 'live', "raw" JSONB NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX "major_financial_events_canonical_key_key" ON "major_financial_events"("canonical_key");
CREATE INDEX "major_financial_events_published_at_category_idx" ON "major_financial_events"("published_at" DESC,"category");
