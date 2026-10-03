import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { AppBindings } from "./env.js";
import { ApiError } from "./lib/http.js";
import { injectDb, requireTeacher } from "./middleware/auth.js";
import { attemptRoutes } from "./routes/attempts.js";
import { authRoutes } from "./routes/auth.js";
import { batchRoutes } from "./routes/batches.js";
import { examRoutes } from "./routes/exams.js";
import { mediaRoutes } from "./routes/media.js";
import { moduleRoutes, questionRoutes, topicRoutes } from "./routes/questions.js";
import { reportRoutes } from "./routes/reports.js";

const app = new Hono<AppBindings>();

app.use("*", logger());

// CORS is allow-listed per environment; cookies are sent, so no wildcard.
app.use("*", async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : undefined),
    credentials: true,
  })(c, next);
});

app.use("*", injectDb);

app.get("/health", (c) =>
  c.json({ data: { ok: true, env: c.env.ENVIRONMENT, now: new Date().toISOString() } }),
);

// Public: teacher auth + the (unauthenticated) student attempt flow.
app.route("/api/auth", authRoutes);
app.route("/api/attempts", attemptRoutes);
// Media GET is public (unguessable key); POST is guarded inside the router.
app.route("/api/media", mediaRoutes);

// Protected: everything a signed-in teacher does.
const teacherRoutes = new Hono<AppBindings>();
teacherRoutes.use("*", requireTeacher);
teacherRoutes.route("/batches", batchRoutes);
teacherRoutes.route("/topics", topicRoutes);
teacherRoutes.route("/questions", questionRoutes);
teacherRoutes.route("/modules", moduleRoutes);
teacherRoutes.route("/exams", examRoutes);
teacherRoutes.route("/reports", reportRoutes);
app.route("/api", teacherRoutes);

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: `No route for ${c.req.method} ${c.req.path}` } }, 404),
);

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json(
      { error: { code: error.code, message: error.message, fields: error.fields } },
      error.status,
    );
  }
  console.error(error);
  return c.json({ error: { code: "internal", message: "Something went wrong" } }, 500);
});

export default app;

// Durable Object class must be exported from the Worker entry point.
export { ExamSession } from "./durable/exam-session.js";
