CREATE TABLE "local_users" (
  "id" TEXT NOT NULL, "email" TEXT NOT NULL, "display_name" TEXT,
  "password_hash" TEXT NOT NULL, "password_salt" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "local_users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "local_users_email_key" ON "local_users"("email");

CREATE TABLE "user_sessions" (
  "id" BIGSERIAL NOT NULL, "user_id" TEXT NOT NULL, "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "local_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");
CREATE INDEX "user_sessions_user_id_expires_at_idx" ON "user_sessions"("user_id", "expires_at");

CREATE TABLE "market_scan_runs" (
  "id" BIGSERIAL NOT NULL, "trade_date" DATE, "trigger" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'running', "provider" TEXT NOT NULL,
  "universe_size" INTEGER NOT NULL DEFAULT 0, "snapshot_size" INTEGER NOT NULL DEFAULT 0,
  "covered_count" INTEGER NOT NULL DEFAULT 0, "candidate_count" INTEGER NOT NULL DEFAULT 0,
  "actual_universe" JSONB NOT NULL DEFAULT '{}', "degradation" JSONB NOT NULL DEFAULT '[]',
  "results" JSONB NOT NULL DEFAULT '[]', "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMP(3), "error" TEXT,
  CONSTRAINT "market_scan_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "market_scan_runs_started_at_status_idx" ON "market_scan_runs"("started_at" DESC, "status");
