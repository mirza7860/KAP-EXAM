import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.js";

export { schema };

/** The Drizzle client bound to a Cloudflare D1 database. */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Database = ReturnType<typeof createDb>;
