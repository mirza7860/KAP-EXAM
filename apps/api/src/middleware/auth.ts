import { createDb } from "@kap-exam/db";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../env.js";
import { SESSION_COOKIE, readSession } from "../lib/auth.js";
import { unauthorized } from "../lib/http.js";

/** Binds a request-scoped Drizzle client to the D1 database. */
export const injectDb = createMiddleware<AppBindings>(async (c, next) => {
  c.set("db", createDb(c.env.DB));
  await next();
});

/** Requires a valid teacher session (cookie or `Authorization: Bearer`). */
export const requireTeacher = createMiddleware<AppBindings>(async (c, next) => {
  const bearer = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const token = getCookie(c, SESSION_COOKIE) ?? bearer;
  if (!token) throw unauthorized();

  const session = await readSession(token, c.env.JWT_SECRET);
  if (!session) throw unauthorized("Session expired");

  c.set("teacher", session);
  await next();
});
