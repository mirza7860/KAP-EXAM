import { schema } from "@kap-exam/db";
import type { AttemptResult, ExamReport, StudentReport } from "@kap-exam/shared";
import { asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { notFound } from "../lib/http.js";
import type { Question } from "@kap-exam/shared";

/**
 * Reports. Per-exam rosters (ascending by roll no) and per-student
 * cumulative report cards that span batches/semesters.
 */
export const reportRoutes = new Hono<AppBindings>();

async function paperQuestions(db: AppBindings["Variables"]["db"], examId: string): Promise<Question[]> {
  const items = await db
    .select()
    .from(schema.examPaperItems)
    .where(eq(schema.examPaperItems.examId, examId));
  return items.map((it) => JSON.parse(it.snapshotJson) as Question);
}

/** Score an attempt from frozen paper + saved answers. */
async function scoreAttempt(
  db: AppBindings["Variables"]["db"],
  attemptId: string,
  examId: string,
): Promise<{ score: number; maxScore: number; correct: number; wrong: number; unattempted: number }> {
  const paper = await paperQuestions(db, examId);
  const saved = await db.select().from(schema.answers).where(eq(schema.answers.attemptId, attemptId));
  const byQ = new Map(saved.map((a) => [a.questionId, a]));
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  let maxScore = 0;
  for (const q of paper) {
    maxScore += q.marks;
    const ans = byQ.get(q.id);
    if (!ans) {
      unattempted++;
      continue;
    }
    if (ans.isCorrect === null || ans.isCorrect === undefined) {
      // fall back to awardedMarks presence: if no selection and no numeric, unattempted
      let sel: string[] = [];
      try {
        sel = JSON.parse(ans.selectedJson as string) as string[];
      } catch {
        sel = [];
      }
      const hasAns = sel.length > 0 || (ans.numericValue !== null && ans.numericValue !== undefined);
      if (!hasAns) {
        unattempted++;
        continue;
      }
    }
    score += ans.awardedMarks ?? 0;
    if (ans.isCorrect === null) unattempted++;
    else if (ans.isCorrect) correct++;
    else wrong++;
  }
  return { score, maxScore, correct, wrong, unattempted };
}

reportRoutes.get("/exams/:examId", async (c) => {
  const db = c.get("db");
  const examId = c.req.param("examId");
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
    const sc = await scoreAttempt(db, att.id, examId);
    // persist computed score if attempt closed and score missing
    if ((att.status === "submitted" || att.status === "timed_out") && (att.score === null || att.score === undefined)) {
      await db.update(schema.attempts).set({ score: sc.score, maxScore: sc.maxScore }).where(eq(schema.attempts.id, att.id));
    }
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
  const report: ExamReport = {
    examId,
    examTitle: exam.title,
    batchName: batch?.name ?? "",
    closedAt: exam.closedAt ?? exam.endsAt,
    maxScore,
    results,
  };
  return c.json({ data: report });
});

reportRoutes.get("/students/:studentId", async (c) => {
  const db = c.get("db");
  const studentId = c.req.param("studentId");
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

  let examsTaken = 0;
  let examsMissed = 0;
  const totals = { score: 0, maxScore: 0, correct: 0, wrong: 0, unattempted: 0 };
  const history: StudentReport["history"] = [];

  for (const att of attempts) {
    const exam = examMap.get(att.examId);
    if (!exam) continue;
    const sc = await scoreAttempt(db, att.id, att.examId);
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
      // extra for tabs (not in zod schema but harmless at runtime; strip before validation on client)
      ...({ batchId: exam.batchId, batchName: batchMap.get(exam.batchId)?.name ?? "" } as object),
    });
  }

  // examsMissed: published/closed exams in member batches with no attempt
  if (memberBatchIds.length > 0) {
    const batchExams = await db.select().from(schema.exams).where(inArray(schema.exams.batchId, memberBatchIds));
    const attempted = new Set(attempts.map((a) => a.examId));
    for (const e of batchExams) {
      if ((e.status === "published" || e.status === "closed") && !attempted.has(e.id)) {
        examsMissed++;
      }
    }
  }

  history.sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime());

  const report: StudentReport & { batches: { id: string; name: string }[] } = {
    studentId,
    name: student.name,
    rollNo: student.rollNo,
    examsTaken,
    examsMissed,
    totals,
    history,
    batches: memberBatches.map((b) => ({ id: b.id, name: b.name })),
  };
  return c.json({ data: report });
});
