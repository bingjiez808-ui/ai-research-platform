CREATE TABLE "portfolios" (
  "id" BIGSERIAL PRIMARY KEY,
  "owner_key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'CNY',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "portfolios_owner_key_idx" ON "portfolios"("owner_key");

CREATE TABLE "portfolio_holdings" (
  "id" BIGSERIAL PRIMARY KEY,
  "portfolio_id" BIGINT NOT NULL REFERENCES "portfolios"("id") ON DELETE CASCADE,
  "stock_id" BIGINT NOT NULL REFERENCES "stocks"("id") ON DELETE RESTRICT,
  "stock_code" TEXT NOT NULL,
  "shares" DECIMAL(24,4) NOT NULL,
  "cost_price" DECIMAL(20,4) NOT NULL,
  "current_value" DECIMAL(24,2),
  "weight" DECIMAL(10,6),
  "source" TEXT NOT NULL DEFAULT 'manual',
  "raw" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  UNIQUE ("portfolio_id", "stock_id")
);
CREATE INDEX "portfolio_holdings_portfolio_id_idx" ON "portfolio_holdings"("portfolio_id");

CREATE TABLE "portfolio_imports" (
  "id" BIGSERIAL PRIMARY KEY,
  "portfolio_id" BIGINT NOT NULL REFERENCES "portfolios"("id") ON DELETE CASCADE,
  "import_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "file_name" TEXT,
  "rows_read" INTEGER NOT NULL DEFAULT 0,
  "rows_written" INTEGER NOT NULL DEFAULT 0,
  "result" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3)
);
CREATE INDEX "portfolio_imports_portfolio_id_created_at_idx" ON "portfolio_imports"("portfolio_id", "created_at" DESC);
