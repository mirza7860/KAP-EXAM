import { defineConfig } from "drizzle-kit";

/**
 * Drizzle generates plain SQL migrations; Wrangler applies them to D1.
 * `migrations_dir` is pointed at this folder from apps/api/wrangler.toml.
 */
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/schema.ts",
  out: "./migrations",
  strict: true,
  verbose: true,
});
