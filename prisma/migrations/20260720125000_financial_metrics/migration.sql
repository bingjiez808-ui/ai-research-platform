ALTER TABLE "financial_statements"
  ADD COLUMN "total_liabilities" DECIMAL(24,2),
  ADD COLUMN "roe" DECIMAL(12,4),
  ADD COLUMN "gross_margin" DECIMAL(12,4),
  ADD COLUMN "operating_cash_flow" DECIMAL(24,2),
  ADD COLUMN "investing_cash_flow" DECIMAL(24,2),
  ADD COLUMN "financing_cash_flow" DECIMAL(24,2);

ALTER TABLE "stock_prices"
  ADD COLUMN "pe" DECIMAL(16,4),
  ADD COLUMN "pb" DECIMAL(16,4);
