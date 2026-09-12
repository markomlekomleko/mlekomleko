CREATE TABLE "customer_credentials" (
  "customer_id" text PRIMARY KEY NOT NULL REFERENCES "customers"("id"),
  "password_hash" text NOT NULL,
  "email_verified_at" text NOT NULL,
  "whatsapp_phone" text UNIQUE,
  "whatsapp_verified_at" text,
  "whatsapp_consent_at" text,
  "whatsapp_notifications_at" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE "auth_challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "customer_id" text REFERENCES "customers"("id"),
  "purpose" text NOT NULL CHECK ("purpose" IN ('register', 'login', 'phone')),
  "channel" text NOT NULL CHECK ("channel" IN ('email', 'whatsapp', 'both')),
  "phone" text,
  "password_hash" text,
  "code_hash" text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "expires_at" text NOT NULL,
  "used_at" text,
  "claim_token" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE INDEX "auth_challenges_email_idx" ON "auth_challenges" ("email", "purpose", "expires_at");
