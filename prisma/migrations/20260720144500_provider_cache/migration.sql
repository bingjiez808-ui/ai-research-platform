CREATE TABLE "provider_cache" (
  "id" BIGSERIAL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "cache_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "stale_until" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'fresh',
  "error" TEXT,
  "hit_count" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  UNIQUE ("provider", "cache_key")
);
CREATE INDEX "provider_cache_expires_at_idx" ON "provider_cache"("expires_at");
