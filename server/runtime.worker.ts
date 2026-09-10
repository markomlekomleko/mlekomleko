// Compatibility runtime for the retained Worker contract test suite only.
import { env } from "cloudflare:workers";
export { env };

export function getDatabase(): D1Database {
  if (!env.DB) throw new Error("Database binding DB is unavailable.");
  return env.DB;
}
