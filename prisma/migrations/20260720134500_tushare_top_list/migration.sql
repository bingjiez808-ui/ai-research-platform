CREATE TABLE "dragon_tiger_entries" (
  "id" BIGSERIAL PRIMARY KEY,
  "stock_id" BIGINT REFERENCES "stocks"("id") ON DELETE SET NULL,
  "trade_date" DATE NOT NULL,
  "reason" TEXT,
  "close" DECIMAL(20,4),
  "change_percent" DECIMAL(12,4),
  "turnover_rate" DECIMAL(12,4),
  "amount" DECIMAL(24,2),
  "net_amount" DECIMAL(24,2),
  "source_id" BIGINT NOT NULL REFERENCES "finance_data_sources"("id") ON DELETE RESTRICT,
  "provider_key" TEXT NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "raw" JSONB NOT NULL DEFAULT '{}',
  UNIQUE ("trade_date", "provider_key", "source_id")
);
CREATE INDEX "dragon_tiger_entries_trade_date_idx" ON "dragon_tiger_entries"("trade_date" DESC);
