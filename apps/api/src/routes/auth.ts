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

/**
 * Self-registration is open only until the first account has seeded itself.
 *
 * The schema is single-tenant: no teacher route filters by teacher id, so an
 * owner account reads every batch, every student name + roll and every result.
 * On a public URL an open signup would therefore be open data, and the admin's
 * login page offers one to anyone who finds it. Production closes it again
 * after the first teacher; dev and the e2e suite are never gated.
 */
async function signupIsOpen(c: Context<AppBindings>) {
  if (c.env.ENVIRONMENT !== "production") return true;
  const first = await c
    .get("db")
    .select({ id: schema.teachers.id })
    .from(schema.teachers)
    .limit(1)
    .get();
  return !first;
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

  // Checked before the email lookup so a rejected stranger learns nothing.
  if (!(await signupIsOpen(c))) {
    throw new ApiError(apiErrorCodes.forbidden, "Registration is closed");
  }

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

  const token = await issueSession(teacher, c.env.JWT_SECRET);
  setSessionCookie(c, token, c.env.ENVIRONMENT !== "development");
  return c.json(
    {
      data: {
        teacherId: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role,
        token,
      },
    },
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
  const token = await issueSession(identity, c.env.JWT_SECRET);
  setSessionCookie(c, token, c.env.ENVIRONMENT !== "development");
  return c.json({
    data: {
      teacherId: identity.id,
      name: identity.name,
      email: identity.email,
      role: identity.role,
      token,
    },
  });
});

authRoutes.post("/signout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ data: { ok: true } });
});

authRoutes.get("/me", requireTeacher, (c) => c.json({ data: c.get("teacher") }));

// Public, so the login page can hide its "Sign up" link instead of offering a
// form the Worker would reject. Purely cosmetic - signupIsOpen is the gate.
authRoutes.get("/signup-status", async (c) =>
  c.json({ data: { open: await signupIsOpen(c) } }),
);
