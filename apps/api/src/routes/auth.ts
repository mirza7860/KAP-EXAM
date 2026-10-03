import { schema } from "@kap-exam/db";
import { apiErrorCodes, teacherSignInSchema, teacherSignUpSchema } from "@kap-exam/shared";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import type { AppBindings } from "../env.js";
import { SESSION_COOKIE, SESSION_TTL_MS, hashPassword, issueSession, verifyPassword } from "../lib/auth.js";
import { ApiError, badRequest, unauthorized } from "../lib/http.js";
import { requireTeacher } from "../middleware/auth.js";

export const authRoutes = new Hono<AppBindings>();

function setSessionCookie(c: Context<AppBindings>, token: string, secure: boolean) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "Lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

authRoutes.post("/signup", async (c) => {
  const parsed = teacherSignUpSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    throw badRequest(
      "Invalid sign-up details",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }
  const { name, email, password } = parsed.data;
  const db = c.get("db");

  const existing = await db.select().from(schema.teachers).where(eq(schema.teachers.email, email)).get();
  if (existing) throw new ApiError(apiErrorCodes.conflict, "That email is already registered");

  const teacher = {
    id: crypto.randomUUID(),
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "owner" as const,
  };
  await db.insert(schema.teachers).values(teacher);

  setSessionCookie(c, await issueSession(teacher, c.env.JWT_SECRET), c.env.ENVIRONMENT !== "development");
  return c.json(
    { data: { teacherId: teacher.id, name: teacher.name, email: teacher.email, role: teacher.role } },
    201,
  );
});

authRoutes.post("/signin", async (c) => {
  const parsed = teacherSignInSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Enter your email and password");

  const { email, password } = parsed.data;
  const db = c.get("db");
  const teacher = await db.select().from(schema.teachers).where(eq(schema.teachers.email, email)).get();

  // Identical response whether the email or the password is wrong.
  if (!teacher || teacher.archivedAt) throw unauthorized("Incorrect email or password");
  if (!(await verifyPassword(password, teacher.passwordHash))) {
    throw unauthorized("Incorrect email or password");
  }

  const identity = {
    id: teacher.id,
    name: teacher.name,
    email: teacher.email,
    role: teacher.role,
  };
  setSessionCookie(c, await issueSession(identity, c.env.JWT_SECRET), c.env.ENVIRONMENT !== "development");
  return c.json({
    data: { teacherId: identity.id, name: identity.name, email: identity.email, role: identity.role },
  });
});

authRoutes.post("/signout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ data: { ok: true } });
});

authRoutes.get("/me", requireTeacher, (c) => c.json({ data: c.get("teacher") }));
