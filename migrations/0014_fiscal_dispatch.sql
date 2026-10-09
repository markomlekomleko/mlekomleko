CREATE TABLE "fiscal_dispatches" (
  "operation_key" text PRIMARY KEY NOT NULL REFERENCES "fiscal_receipts"("operation_key"),
  "request_json" text NOT NULL,
  "status" text NOT NULL CHECK ("status" IN ('sending', 'issued', 'rejected', 'unknown')),
  "response_json" text,
  "created_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
