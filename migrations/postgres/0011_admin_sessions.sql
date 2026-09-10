CREATE TABLE "admin_sessions" (
  "token_hash" text PRIMARY KEY NOT NULL,
  "credential_hash" text NOT NULL,
  "expires_at" text NOT NULL,
  "revoked_at" text
);
CREATE INDEX "admin_sessions_expiry_idx" ON "admin_sessions" ("expires_at");
