import { schema } from "@kap-exam/db";
import {
  apiErrorCodes,
  heartbeatSchema,
  joinAttemptSchema,
  normalizeRollNo,
} from "@kap-exam/shared";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppBindings } from "../env.js";
import { callExamSession } from "../lib/durable.js";
import { ApiError, badRequest, notFound } from "../lib/http.js";

/**
 * Student-facing endpoints (no auth). The PWA is untrusted: everything here
 * resolves the exam, then delegates the authoritative clock and attempt state
 * to the per-exam Durable Object.
 */
export const attemptRoutes = new Hono<AppBindings>();

/** Look up the attempt row and hand back just the exam id the DO is keyed by. */
async function resolveAttempt(c: Context<AppBindings>, attemptId: string): Promise<{ examId: string }> {
  const attempt = await c
    .get("db")
    .select()
    .from(schema.attempts)
    .where(eq(schema.attempts.id, attemptId))
    .get();
  if (!attempt) throw notFound("Unknown attempt");
  return { examId: attempt.examId };
}

attemptRoutes.post("/join", async (c) => {
  const parsed = joinAttemptSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Check your name and roll number");

  const { joinCode, name, rollNo, deviceToken } = parsed.data;
  const db = c.get("db");

  const exam = await db.select().from(schema.exams).where(eq(schema.exams.joinCode, joinCode)).get();
  if (!exam) throw notFound("That exam link is not valid");
  if (exam.status !== "published") {
    throw new ApiError(apiErrorCodes.windowClosed, "This exam is not open");
  }

  const now = Date.now();
  if (now < exam.startsAt.getTime() || now >= exam.endsAt.getTime()) {
    throw new ApiError(apiErrorCodes.windowClosed, "This exam is closed");
  }

  // A student is a stable person across semesters: matched by normalized roll no.
  const normalized = normalizeRollNo(rollNo);
  const existingStudent = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.rollNoNormalized, normalized))
    .get();

  const studentId = existingStudent?.id ?? crypto.randomUUID();
  if (!existingStudent) {
    await db.insert(schema.students).values({ id: studentId, name, rollNo, rollNoNormalized: normalized });
  }
  const student = { id: studentId, name: existingStudent?.name ?? name, rollNo: existingStudent?.rollNo ?? rollNo };

  // Enrol them in this batch if they are not already (idempotent).
  const membership = await db
    .select()
    .from(schema.batchStudents)
    .where(and(eq(schema.batchStudents.batchId, exam.batchId), eq(schema.batchStudents.studentId, student.id)))
    .get();
  if (!membership) {
    await db.insert(schema.batchStudents).values({ batchId: exam.batchId, studentId: student.id });
  }

  const existingAttempt = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.examId, exam.id), eq(schema.attempts.studentId, student.id)))
    .get();
  if (existingAttempt && existingAttempt.status !== "in_progress") {
    throw new ApiError(apiErrorCodes.alreadySubmitted, "You have already finished this exam");
  }

  const attemptId = existingAttempt?.id ?? crypto.randomUUID();
  if (!existingAttempt) {
    await db.insert(schema.attempts).values({
      id: attemptId,
      examId: exam.id,
      batchId: exam.batchId,
      studentId: student.id,
      status: "in_progress",
      deadlineAt: exam.endsAt,
      deviceToken,
    });
  }

  // Hand the authoritative clock to the Durable Object.
  await callExamSession(c.env, exam.id, "/init", {
    examId: exam.id,
    endsAt: exam.endsAt.getTime(),
    durationMinutes: exam.durationMinutes,
  });
  const joined = await callExamSession<{
    participant: { deadlineAt: number; startedAt: number; status: string };
    serverNow: number;
  }>(c.env, exam.id, "/join", {
    attemptId,
    studentId: student.id,
    name: student.name,
    rollNo: student.rollNo,
  });
  if (joined.status >= 400) return c.json(joined.data, joined.status as 400);

  // TODO: return the frozen paper from `exam_paper_items`, minus correct answers.
  return c.json({
    data: {
      attemptId,
      exam: { id: exam.id, title: exam.title, durationMinutes: exam.durationMinutes },
      ...joined.data,
      paper: [],
    },
  });
});

attemptRoutes.post("/heartbeat", async (c) => {
  const parsed = heartbeatSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid heartbeat");
  const attempt = await resolveAttempt(c, parsed.data.attemptId);
  const result = await callExamSession(c.env, attempt.examId, "/heartbeat", parsed.data);
  return c.json(result.data, result.status as 200);
});

attemptRoutes.post("/answer", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    attemptId?: string;
    questionId?: string;
    selectedOptionIds?: string[];
    numericValue?: number | null;
  } | null;
  if (!body?.attemptId || !body.questionId) throw badRequest("Invalid answer");
  const attempt = await resolveAttempt(c, body.attemptId);
  const result = await callExamSession(c.env, attempt.examId, "/answer", body);
  return c.json(result.data, result.status as 200);
});

attemptRoutes.post("/submit", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { attemptId?: string } | null;
  if (!body?.attemptId) throw badRequest("Invalid submission");
  const attempt = await resolveAttempt(c, body.attemptId);
  const result = await callExamSession(c.env, attempt.examId, "/submit", body);
  return c.json(result.data, result.status as 200);
});

attemptRoutes.post("/violation", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    attemptId?: string;
    type?: string;
    occurredAt?: number;
    detail?: string | null;
  } | null;
  if (!body?.attemptId || !body.type) throw badRequest("Invalid violation report");
  const attempt = await resolveAttempt(c, body.attemptId);
  const result = await callExamSession(c.env, attempt.examId, "/violation", body);
  return c.json(result.data, result.status as 200);
});
