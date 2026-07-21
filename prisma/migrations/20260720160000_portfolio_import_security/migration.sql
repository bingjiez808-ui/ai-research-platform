ALTER TABLE "portfolio_holdings" ADD COLUMN "buy_date" DATE;

ALTER TABLE "portfolio_imports"
  ADD COLUMN "import_user" TEXT,
  ADD COLUMN "file_size" INTEGER,
  ADD COLUMN "mime_type" TEXT,
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "sheet_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "validation_result" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "preview_rows" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "expires_at" TIMESTAMP(3),
  ADD COLUMN "confirmed_at" TIMESTAMP(3);

UPDATE "portfolio_imports" pi
SET "import_user" = p."owner_key"
FROM "portfolios" p
WHERE p."id" = pi."portfolio_id" AND pi."import_user" IS NULL;

ALTER TABLE "portfolio_imports" ALTER COLUMN "import_user" SET NOT NULL;

CREATE TABLE "portfolio_snapshots" (
  "id" BIGSERIAL PRIMARY KEY,
  "portfolio_id" BIGINT NOT NULL REFERENCES "portfolios"("id") ON DELETE CASCADE,
  "import_id" BIGINT UNIQUE REFERENCES "portfolio_imports"("id") ON DELETE SET NULL,
  "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "total_value" DECIMAL(24,2) NOT NULL DEFAULT 0,
  "total_cost" DECIMAL(24,2) NOT NULL DEFAULT 0,
  "pnl" DECIMAL(24,2) NOT NULL DEFAULT 0,
  "pnl_percent" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "industry_exposure" JSONB NOT NULL DEFAULT '[]',
  "concentration_risk" JSONB NOT NULL DEFAULT '{}',
  "news_risk" JSONB NOT NULL DEFAULT '{}',
  "recommendations" JSONB NOT NULL DEFAULT '[]',
  "citations" JSONB NOT NULL DEFAULT '[]',
  "agent_runs" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3)
);

CREATE INDEX "portfolio_snapshots_portfolio_id_as_of_idx"
  ON "portfolio_snapshots"("portfolio_id", "as_of" DESC);
