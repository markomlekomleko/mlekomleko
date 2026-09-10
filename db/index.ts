import { getDatabase } from "@/server/runtime";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  return drizzle(getDatabase(), { schema });
}

export function getD1(): D1Database {
  return getDatabase();
}
