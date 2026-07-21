-- CreateTable
CREATE TABLE "finance_data_sources" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_url" TEXT,
    "kind" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "industries" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "industries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "exchange" TEXT,
    "status" TEXT NOT NULL DEFAULT 'listed',
    "list_date" DATE,
    "industry_id" BIGINT,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_prices" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" BIGINT NOT NULL,
    "trade_date" DATE NOT NULL,
    "interval" TEXT NOT NULL DEFAULT '1d',
    "open" DECIMAL(20,4),
    "high" DECIMAL(20,4),
    "low" DECIMAL(20,4),
    "close" DECIMAL(20,4) NOT NULL,
    "previous_close" DECIMAL(20,4),
    "change_percent" DECIMAL(12,4),
    "volume" BIGINT,
    "turnover" DECIMAL(24,2),
    "turnover_rate" DECIMAL(12,4),
    "market_cap" DECIMAL(24,2),
    "source_id" BIGINT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "source_url" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_hash" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "stock_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_statements" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" BIGINT NOT NULL,
    "statement_type" TEXT NOT NULL,
    "period_end" DATE NOT NULL,
    "report_type" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "revenue" DECIMAL(24,2),
    "net_profit" DECIMAL(24,2),
    "total_assets" DECIMAL(24,2),
    "total_equity" DECIMAL(24,2),
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "source_id" BIGINT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "source_url" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_hash" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "financial_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_articles" (
    "id" BIGSERIAL NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "stock_id" BIGINT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "category" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "sentiment" DECIMAL(6,4),
    "source_id" BIGINT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_hash" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_reports" (
    "id" BIGSERIAL NOT NULL,
    "canonical_key" TEXT NOT NULL,
    "stock_id" BIGINT,
    "title" TEXT NOT NULL,
    "institution" TEXT,
    "analyst" TEXT,
    "rating" TEXT,
    "target_price" DECIMAL(20,4),
    "published_at" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "summary" TEXT,
    "source_id" BIGINT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_hash" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "research_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_indicators" (
    "id" BIGSERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(24,6) NOT NULL,
    "unit" TEXT,
    "dimensions" JSONB NOT NULL DEFAULT '{}',
    "source_id" BIGINT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "source_url" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload_hash" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "market_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" BIGSERIAL NOT NULL,
    "stock_id" BIGINT,
    "agent" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "as_of" TIMESTAMP(3) NOT NULL,
    "score" DECIMAL(8,4),
    "signal" TEXT,
    "summary" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "risks" JSONB NOT NULL DEFAULT '[]',
    "source_id" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_ingestion_runs" (
    "id" BIGSERIAL NOT NULL,
    "job" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "source_id" BIGINT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "records_read" INTEGER NOT NULL DEFAULT 0,
    "records_written" INTEGER NOT NULL DEFAULT 0,
    "anomalies" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "finance_ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "finance_data_sources_key_key" ON "finance_data_sources"("key");

-- CreateIndex
CREATE UNIQUE INDEX "industries_code_key" ON "industries"("code");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_code_key" ON "stocks"("code");

-- CreateIndex
CREATE INDEX "stocks_market_status_idx" ON "stocks"("market", "status");

-- CreateIndex
CREATE INDEX "stock_prices_trade_date_idx" ON "stock_prices"("trade_date");

-- CreateIndex
CREATE UNIQUE INDEX "stock_prices_stock_id_trade_date_interval_source_id_key" ON "stock_prices"("stock_id", "trade_date", "interval", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "financial_statements_stock_id_statement_type_period_end_sou_key" ON "financial_statements"("stock_id", "statement_type", "period_end", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_articles_canonical_key_key" ON "news_articles"("canonical_key");

-- CreateIndex
CREATE INDEX "news_articles_published_at_idx" ON "news_articles"("published_at" DESC);

-- CreateIndex
CREATE INDEX "news_articles_stock_id_published_at_idx" ON "news_articles"("stock_id", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "research_reports_canonical_key_key" ON "research_reports"("canonical_key");

-- CreateIndex
CREATE INDEX "research_reports_published_at_idx" ON "research_reports"("published_at" DESC);

-- CreateIndex
CREATE INDEX "market_indicators_observed_at_idx" ON "market_indicators"("observed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "market_indicators_key_observed_at_source_id_key" ON "market_indicators"("key", "observed_at", "source_id");

-- CreateIndex
CREATE INDEX "ai_analyses_stock_id_agent_as_of_idx" ON "ai_analyses"("stock_id", "agent", "as_of" DESC);

-- CreateIndex
CREATE INDEX "finance_ingestion_runs_job_started_at_idx" ON "finance_ingestion_runs"("job", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "industries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_prices" ADD CONSTRAINT "stock_prices_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_prices" ADD CONSTRAINT "stock_prices_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "finance_data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_statements" ADD CONSTRAINT "financial_statements_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "finance_data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "finance_data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_reports" ADD CONSTRAINT "research_reports_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_reports" ADD CONSTRAINT "research_reports_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "finance_data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_indicators" ADD CONSTRAINT "market_indicators_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "finance_data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "finance_data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_ingestion_runs" ADD CONSTRAINT "finance_ingestion_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "finance_data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
