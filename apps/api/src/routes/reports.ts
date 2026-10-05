import { schema } from "@kap-exam/db";
import type { AttemptResult, ExamReport, StudentReport } from "@kap-exam/shared";
import { eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { notFound } from "../lib/http.js";
import { paginate, pageParams } from "../lib/pagination.js";
import { scoreAttempt, scoreAttempts, type Db, type Score } from "../lib/scoring.js";

/**
 * Reports. Per-exam rosters (ascending by roll no) and per-student
 * cumulative report cards that span batches/semesters.
 *
 * Grading lives in `lib/scoring.ts`: the classroom leaderboard runs the same
 * function, so a projected rank and a printed report card cannot disagree.
 */
export const reportRoutes = new Hono<AppBindings>();

/** Persist a computed score for a finished attempt that never got one. */
async function persistMissingScore(
  db: Db,
  attempt: { id: string; status: string; score: number | null; maxScore: number | null },
  scored: Score,
): Promise<void> {
  if ((attempt.status === "submitted" || attempt.status === "timed_out") && !attempt.score) {
    await db
      .update(schema.attempts)
      .set({ score: scored.score, maxScore: scored.maxScore })
      .where(eq(schema.attempts.id, attempt.id));
  }
}

reportRoutes.get("/exams/:examId", async (c) => {
  const db = c.get("db");
  const examId = c.req.param("examId");
  const page = pageParams(c);

  const exam = await db.select().from(schema.exams).where(eq(schema.exams.id, examId)).get();
  if (!exam) throw notFound("Exam not found");
  const batch = await db.select().from(schema.batches).where(eq(schema.batches.id, exam.batchId)).get();

  const attempts = await db.select().from(schema.attempts).where(eq(schema.attempts.examId, examId));
  // roster-first: include every batch member; those without attempt are absent
  const roster = await db
    .select({ studentId: schema.batchStudents.studentId })
    .from(schema.batchStudents)
    .where(eq(schema.batchStudents.batchId, exam.batchId));
  const rosterIds = new Set(roster.map((r) => r.studentId));
  for (const a of attempts) rosterIds.add(a.studentId);

  const byAttemptStudent = new Map(attempts.map((a) => [a.studentId, a]));

  const allStudents =
    rosterIds.size > 0
      ? await db.select().from(schema.students).where(inArray(schema.students.id, [...rosterIds]))
      : [];
  const studentMap = new Map(allStudents.map((s) => [s.id, s]));

  const scores = await scoreAttempts(db, attempts.map((a) => ({ id: a.id, examId })));

  const results: AttemptResult[] = [];
  for (const sid of rosterIds) {
    const s = studentMap.get(sid);
    if (!s) continue;
    const att = byAttemptStudent.get(sid);
    if (!att) {
      results.push({
        attemptId: "",
        studentId: s.id,
        studentName: s.name,
        rollNo: s.rollNo,
        status: "abandoned",
        score: 0,
        maxScore: 0,
        correct: 0,
        wrong: 0,
        unattempted: 0,
        violationCount: 0,
      });
      continue;
    }
    const sc = scores.get(att.id) ?? { score: 0, maxScore: 0, correct: 0, wrong: 0, unattempted: 0 };
    await persistMissingScore(db, att, sc);
    results.push({
      attemptId: att.id,
      studentId: s.id,
      studentName: s.name,
      rollNo: s.rollNo,
      status: att.status,
      score: att.score ?? sc.score,
      maxScore: sc.maxScore,
      correct: sc.correct,
      wrong: sc.wrong,
      unattempted: sc.unattempted,
      violationCount: att.violationCount ?? 0,
    });
  }

  // ascending by roll no for printing
  results.sort((a, b) => a.rollNo.localeCompare(b.rollNo, undefined, { numeric: true }));

  const maxScore = results.reduce((m, r) => Math.max(m, r.maxScore), 0);
  // Summary covers the *whole* cohort even though `results` is one page of it.
  const appeared = results.filter((r) => r.attemptId !== "").length;
  const avgScore =
    appeared > 0
      ? results.filter((r) => r.attemptId !== "").reduce((sum, r) => sum + r.score, 0) / appeared
      : 0;

  const paged = paginate(results, results.length, page);
  const report: ExamReport = {
    examId,
    examTitle: exam.title,
    batchName: batch?.name ?? "",
    closedAt: exam.closedAt ?? exam.endsAt,
    maxScore,
    results: paged.items,
  };

  return c.json({
    data: {
      ...report,
      summary: { totalStudents: results.length, appeared, avgScore },
      total: paged.total,
      limit: paged.limit,
      offset: paged.offset,
      hasMore: paged.hasMore,
    },
  });
});

reportRoutes.get("/students/:studentId", async (c) => {
  const db = c.get("db");
  const studentId = c.req.param("studentId");
  const page = pageParams(c);
  /** Optional batch tab — filters the history, never the overall totals. */
  const batchFilter = c.req.query("batchId") ?? "";

  const student = await db.select().from(schema.students).where(eq(schema.students.id, studentId)).get();
  if (!student) throw notFound("Student not found");

  const attempts = await db
    .select()
    .from(schema.attempts)
    .where(eq(schema.attempts.studentId, studentId));

  const examIds = [...new Set(attempts.map((a) => a.examId))];
  const exams = examIds.length
    ? await db.select().from(schema.exams).where(inArray(schema.exams.id, examIds))
    : [];
  const examMap = new Map(exams.map((e) => [e.id, e]));
  const batchIds = [...new Set(exams.map((e) => e.batchId))];
  const batches = batchIds.length
    ? await db.select().from(schema.batches).where(inArray(schema.batches.id, batchIds))
    : [];
  const batchMap = new Map(batches.map((b) => [b.id, b]));

  // memberships for tabs
  const memberships = await db.select().from(schema.batchStudents).where(eq(schema.batchStudents.studentId, studentId));
  const memberBatchIds = memberships.map((m) => m.batchId);
  const memberBatches =
    memberBatchIds.length > 0
      ? await db.select().from(schema.batches).where(inArray(schema.batches.id, memberBatchIds))
      : [];

  const scores = await scoreAttempts(db, attempts.map((a) => ({ id: a.id, examId: a.examId })));

  let examsTaken = 0;
  let examsMissed = 0;
  const totals = { score: 0, maxScore: 0, correct: 0, wrong: 0, unattempted: 0 };
  type HistoryRow = StudentReport["history"][number] & { batchId: string; batchName: string };
  const history: HistoryRow[] = [];

  for (const att of attempts) {
    const exam = examMap.get(att.examId);
    if (!exam) continue;
    const sc = scores.get(att.id) ?? { score: 0, maxScore: 0, correct: 0, wrong: 0, unattempted: 0 };
    examsTaken++;
    totals.score += att.score ?? sc.score;
    totals.maxScore += sc.maxScore;
    totals.correct += sc.correct;
    totals.wrong += sc.wrong;
    totals.unattempted += sc.unattempted;
    history.push({
      attemptId: att.id,
      studentId,
      studentName: student.name,
      rollNo: student.rollNo,
      status: att.status,
      score: att.score ?? sc.score,
      maxScore: sc.maxScore,
      correct: sc.correct,
      wrong: sc.wrong,
      unattempted: sc.unattempted,
      violationCount: att.violationCount ?? 0,
      examTitle: exam.title,
      takenAt: att.startedAt,
      batchId: exam.batchId,
      batchName: batchMap.get(exam.batchId)?.name ?? "",
    });
  }

  // Exams in this student's batches that were given but never sat.
  const missedExams: {
    id: string;
    title: string;
    batchId: string;
    batchName: string;
    startsAt: string;
  }[] = [];
  if (memberBatchIds.length > 0) {
    const batchExams = await db.select().from(schema.exams).where(inArray(schema.exams.batchId, memberBatchIds));
    const attempted = new Set(attempts.map((a) => a.examId));
    for (const e of batchExams) {
      if ((e.status === "published" || e.status === "closed") && !attempted.has(e.id)) {
        examsMissed++;
        missedExams.push({
          id: e.id,
          title: e.title,
          batchId: e.batchId,
          batchName: batchMap.get(e.batchId)?.name ?? "",
          startsAt: String(e.startsAt),
        });
      }
    }
    missedExams.sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1));
  }

  history.sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime());

  // Totals span every attempt; only the visible slice is paginated — and when a
  // batch tab is open, only that batch's rows are ever in scope.
  const scoped = batchFilter ? history.filter((row) => row.batchId === batchFilter) : history;
  const paged = paginate(scoped, scoped.length, page);

  const report: StudentReport & {
    batches: { id: string; name: string }[];
    missedExams: typeof missedExams;
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  } = {
    studentId,
    name: student.name,
    rollNo: student.rollNo,
    examsTaken,
    examsMissed,
    totals,
    history: paged.items,
    batches: memberBatches.map((b) => ({ id: b.id, name: b.name })),
    missedExams,
    total: paged.total,
    limit: paged.limit,
    offset: paged.offset,
    hasMore: paged.hasMore,
  };
  return c.json({ data: report });
});
