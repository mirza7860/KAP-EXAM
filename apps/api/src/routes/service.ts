import { schema } from "@kap-exam/db";
import { normalizeRollNo, rollNoSchema } from "@kap-exam/shared";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { scoreAttempts } from "../lib/scoring.js";

/**
 * Service-to-service reads for the KAP APP backend, which shows these results
 * inside its own student exam section.
 *
 * This router deliberately stands outside the teacher session: the caller is a
 * Worker holding `SERVICE_TOKEN`, not a teacher holding a JWT, so
 * `requireTeacher` must never be mounted here. The token is compared in
 * constant time and the route returns roll + score only — no answers, no
 * question content, no roster. A caller that guesses a roll number learns at
 * most one student's finished marks, which is the same sightline a published
 * leaderboard already gives a classroom.
 *
 * Read-only by construction: scores are recomputed through `scoreAttempts`
 * (the same function the reports use, so the numbers cannot disagree) but,
 * unlike the report routes, nothing is written back. A service read must not
 * have side effects on data it does not own the meaning of.
 *
 * Wire shape (JSON, also mirrored as a zod schema on the caller's side):
 *   { data: { rollNo: string, results: Array<{
 *     examId: string, examTitle: string,
 *     score: number, maxScore: number,
 *     submittedAt: number | null
 *   }> } }
 * Only finished attempts (`submitted`, `timed_out`) in revealed exams, and
 * only rows where both numbers exist — a result without a max cannot be
 * rendered as a mark, so it is dropped rather than sent as null.
 */
export const serviceRoutes = new Hono<AppBindings>();

function tokensEqual(provided: string, expected: string): boolean {
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

serviceRoutes.get("/results", async (c) => {
  const configured = c.env.SERVICE_TOKEN;
  const header = c.req.header("Authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  /* Fail closed: an unset secret denies everything rather than letting the
     comparison run against an empty string. */
  if (!configured || !provided || !tokensEqual(provided, configured)) {
    return c.json(
      { error: { code: "unauthorized", message: "Invalid service credentials" } },
      401,
    );
  }

  const parsed = rollNoSchema.safeParse(c.req.query("roll") ?? "");
  if (!parsed.success) {
    return c.json(
      { error: { code: "bad_request", message: "A roll number is required" } },
      400,
    );
  }
  const db = c.get("db");
  const normalized = normalizeRollNo(parsed.data);

  const student = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.rollNoNormalized, normalized))
    .get();
  if (!student) {
    return c.json({ data: { rollNo: parsed.data.trim(), results: [] } });
  }

  const attempts = await db
    .select()
    .from(schema.attempts)
    .where(
      and(
        eq(schema.attempts.studentId, student.id),
        inArray(schema.attempts.status, ["submitted", "timed_out"]),
      ),
    );
  if (attempts.length === 0) {
    return c.json({ data: { rollNo: student.rollNo, results: [] } });
  }

  const examIds = [...new Set(attempts.map((a) => a.examId))];
  const exams = await db
    .select()
    .from(schema.exams)
    .where(and(inArray(schema.exams.id, examIds), isNotNull(schema.exams.revealedAt)));
  const revealed = new Map(exams.map((e) => [e.id, e]));

  const scores = await scoreAttempts(
    db,
    attempts.map((a) => ({ id: a.id, examId: a.examId })),
  );

  const results = [];
  for (const att of attempts) {
    const exam = revealed.get(att.examId);
    if (!exam) continue;
    const sc = scores.get(att.id);
    /* Stored score first (what the student saw), recomputed as the backstop —
       the same precedence the report routes use. */
    const score = att.score ?? sc?.score ?? null;
    const maxScore = sc?.maxScore ?? att.maxScore ?? null;
    if (score === null || maxScore === null) continue;
    results.push({
      examId: exam.id,
      examTitle: exam.title,
      score,
      maxScore,
      submittedAt: att.submittedAt ? att.submittedAt.getTime() : null,
    });
  }
  results.sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));

  return c.json({ data: { rollNo: student.rollNo, results } });
});
