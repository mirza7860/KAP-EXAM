import { schema } from "@kap-exam/db";
import { normalizeRollNo, rollNoSchema } from "@kap-exam/shared";
import { and, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
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
 * Wire shapes (JSON):
 *   GET  /results                { data: { rollNo, results: [
 *     examId, examTitle, score, maxScore, submittedAt ] } }
 *   POST /sync-batch             {batchId, batchName, description?,
 *     students: [{id, name, rollNo}] }
 *     → { data: { batchId, synced, updated, removed, skipped } }
 *   GET  /batches/:batchId/exams { data: { batchId, exams: [
 *     examId, batchId, title, status, startsAt, endsAt, revealedAt,
 *     maxScore, appeared, avgScore ] } }
 *   GET  /exams/:examId          { data: { exam {
 *     examId, batchId, title, status, startsAt, endsAt, revealedAt },
 *     roster: [attemptId, studentId, studentName, status, score,
 *       maxScore, submittedAt] } }
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

/** The credential check every route below starts with. */
function requireService(c: {
  env: AppBindings["Bindings"];
  req: { header: (name: string) => string | undefined };
  json: (body: unknown, status: number) => Response;
}): Response | null {
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
  return null;
}

serviceRoutes.get("/results", async (c) => {
  const denied = requireService(c);
  if (denied) return denied;

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

/* ------------------------------------------------------------ sync-batch */

/**
 * One-click roster sync from the KAP APP admin dashboard.
 *
 * The admin side owns the roster: batches and students are created there, and
 * this route makes the exam side match — upserting the batch, upserting every
 * student, adding missing memberships and removing memberships that are no
 * longer on the list. Attempts are never touched, so dropping a student
 * removes them from future rosters without rewriting history.
 *
 * Ids travel through verbatim (both systems use uuids), which is what makes a
 * repeated sync a no-op rather than a duplication. Re-running after a
 * mid-way failure simply finishes the job.
 */
const syncStudentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  rollNo: rollNoSchema,
});

const syncBatchSchema = z.object({
  batchId: z.string().uuid(),
  batchName: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  students: z.array(syncStudentSchema).max(2000),
});

serviceRoutes.post("/sync-batch", async (c) => {
  const denied = requireService(c);
  if (denied) return denied;

  const parsed = syncBatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: { code: "bad_request", message: "batchId, batchName and students[] are required" } },
      400,
    );
  }
  const db = c.get("db");
  const { batchId, batchName, description, students } = parsed.data;

  await db
    .insert(schema.batches)
    .values({ id: batchId, name: batchName, description: description ?? null })
    .onConflictDoUpdate({
      target: schema.batches.id,
      set: { name: batchName, description: description ?? null },
    });

  let synced = 0;
  let updated = 0;
  const skipped: Array<{ id: string; name: string; reason: string }> = [];
  const kept: string[] = [];

  for (const s of students) {
    const rollNo = s.rollNo.trim();
    const rollNoNormalized = normalizeRollNo(rollNo);
    /* The normalized roll is globally unique, and two different spellings can
       normalize to the same key ("R-01" vs "R01"). Check explicitly so a
       collision skips one student with a reason instead of failing the sync. */
    const clash = await db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(eq(schema.students.rollNoNormalized, rollNoNormalized))
      .get();
    if (clash && clash.id !== s.id) {
      skipped.push({ id: s.id, name: s.name, reason: "roll number already belongs to another student" });
      continue;
    }
    const existing = await db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(eq(schema.students.id, s.id))
      .get();
    await db
      .insert(schema.students)
      .values({ id: s.id, name: s.name, rollNo, rollNoNormalized })
      .onConflictDoUpdate({
        target: schema.students.id,
        set: { name: s.name, rollNo, rollNoNormalized },
      });
    await db
      .insert(schema.batchStudents)
      .values({ batchId, studentId: s.id })
      .onConflictDoNothing();
    kept.push(s.id);
    if (existing) updated += 1;
    else synced += 1;
  }

  /* Memberships the list no longer names are removed — for this batch only.
     Students and attempts stay where they are. */
  const current = await db
    .select({ studentId: schema.batchStudents.studentId })
    .from(schema.batchStudents)
    .where(eq(schema.batchStudents.batchId, batchId));
  const keptSet = new Set(kept);
  const stale = current.map((r) => r.studentId).filter((id) => !keptSet.has(id));
  if (stale.length > 0) {
    await db
      .delete(schema.batchStudents)
      .where(
        and(eq(schema.batchStudents.batchId, batchId), inArray(schema.batchStudents.studentId, stale)),
      );
  }

  return c.json({
    data: { batchId, synced, updated, removed: stale.length, skipped },
  });
});

/* ---------------------------------------------------------- batch exams */

/**
 * Every exam in a batch, with a one-line summary each — what the admin
 * dashboard's batch exam section is built from. All statuses, not just
 * revealed ones: a teacher looking at their batch should see the draft too.
 */
serviceRoutes.get("/batches/:batchId/exams", async (c) => {
  const denied = requireService(c);
  if (denied) return denied;

  const db = c.get("db");
  const batchId = c.req.param("batchId");
  const exams = await db
    .select()
    .from(schema.exams)
    .where(eq(schema.exams.batchId, batchId));

  const out = [];
  for (const exam of exams) {
    const attempts = await db
      .select()
      .from(schema.attempts)
      .where(eq(schema.attempts.examId, exam.id));
    const finished = attempts.filter((a) => a.status === "submitted" || a.status === "timed_out");
    const scores = await scoreAttempts(
      db,
      finished.map((a) => ({ id: a.id, examId: a.examId })),
    );
    let maxScore = 0;
    let total = 0;
    let counted = 0;
    for (const att of finished) {
      const score = att.score ?? scores.get(att.id)?.score ?? null;
      const max = scores.get(att.id)?.maxScore ?? att.maxScore ?? null;
      if (max !== null) maxScore = Math.max(maxScore, max);
      if (score !== null) {
        total += score;
        counted += 1;
      }
    }
    out.push({
      examId: exam.id,
      batchId: exam.batchId,
      title: exam.title,
      status: exam.status,
      startsAt: exam.startsAt.getTime(),
      endsAt: exam.endsAt.getTime(),
      revealedAt: exam.revealedAt ? exam.revealedAt.getTime() : null,
      maxScore,
      appeared: finished.length,
      avgScore: counted > 0 ? total / counted : null,
    });
  }
  out.sort((a, b) => b.startsAt - a.startsAt);

  return c.json({ data: { batchId, exams: out } });
});

/* ---------------------------------------------------------- exam detail */

/**
 * One exam with its full roster — the read-only detail behind the admin
 * dashboard's external exam rows. Every attempt is included, finished or
 * not; unfinished ones carry null scores rather than being hidden, so the
 * roster reads as a roster instead of a leaderboard.
 */
serviceRoutes.get("/exams/:examId", async (c) => {
  const denied = requireService(c);
  if (denied) return denied;

  const db = c.get("db");
  const exam = await db
    .select()
    .from(schema.exams)
    .where(eq(schema.exams.id, c.req.param("examId")))
    .get();
  if (!exam) {
    return c.json({ error: { code: "not_found", message: "Exam not found" } }, 404);
  }

  const attempts = await db
    .select()
    .from(schema.attempts)
    .where(eq(schema.attempts.examId, exam.id));
  const studentIds = [...new Set(attempts.map((a) => a.studentId))];
  const students =
    studentIds.length > 0
      ? await db.select().from(schema.students).where(inArray(schema.students.id, studentIds))
      : [];
  const names = new Map(students.map((s) => [s.id, s.name]));
  const scores = await scoreAttempts(
    db,
    attempts.map((a) => ({ id: a.id, examId: a.examId })),
  );

  const roster = attempts.map((att) => ({
    attemptId: att.id,
    studentId: att.studentId,
    studentName: names.get(att.studentId) ?? "Unknown student",
    status: att.status,
    score: att.score ?? scores.get(att.id)?.score ?? null,
    maxScore: scores.get(att.id)?.maxScore ?? att.maxScore ?? null,
    submittedAt: att.submittedAt ? att.submittedAt.getTime() : null,
  }));
  roster.sort((a, b) => (a.studentName ?? "").localeCompare(b.studentName ?? ""));

  return c.json({
    data: {
      exam: {
        examId: exam.id,
        batchId: exam.batchId,
        title: exam.title,
        status: exam.status,
        startsAt: exam.startsAt.getTime(),
        endsAt: exam.endsAt.getTime(),
        revealedAt: exam.revealedAt ? exam.revealedAt.getTime() : null,
      },
      roster,
    },
  });
});
