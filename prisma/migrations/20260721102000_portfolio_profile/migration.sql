ALTER TABLE "portfolios"
  ADD COLUMN "capital" DECIMAL(24,2),
  ADD COLUMN "risk_preference" TEXT NOT NULL DEFAULT 'medium';
