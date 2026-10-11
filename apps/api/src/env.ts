import type { Database } from "@kap-exam/db";

/**
 * Worker bindings. Secrets (`JWT_SECRET`) are set with
 * `wrangler secret put JWT_SECRET`, never committed. See `.dev.vars.example`.
 */
export interface Env {
  DB: D1Database;
  EXAM_SESSION: DurableObjectNamespace;
  MATERIALS_BUCKET: R2Bucket;
  KV: KVNamespace;

  ENVIRONMENT: string;
  ALLOWED_ORIGINS: string;
  HEARTBEAT_GRACE_SECONDS: string;
  JWT_SECRET: string;
  /**
   * Shared secret for the KAP APP backend's results read
   * (`routes/service.ts`). Set with `wrangler secret put SERVICE_TOKEN` —
   * never committed, never a JWT, and scoped to that one route.
   */
  SERVICE_TOKEN: string;
}

/** Hono context shape: `c.get("db")` and `c.get("teacher")` are typed. */
export type AppBindings = {
  Bindings: Env;
  Variables: {
    db: Database;
    teacher: import("@kap-exam/shared").Session;
  };
};
