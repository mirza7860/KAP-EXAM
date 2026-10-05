import { schema, type Database } from "@kap-exam/db";
import {
  apiErrorCodes,
  heartbeatSchema,
  joinAttemptSchema,
  normalizeRollNo,
  type Question,
} from "@kap-exam/shared";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import type { AppBindings } from "../env.js";
import { callExamSession } from "../lib/durable.js";
import { gradeQuestion, sanitizeForStudent } from "../lib/grading.js";
import { ApiError, badRequest, notFound } from "../lib/http.js";

/**
 * Student-facing endpoints (no auth). Roster-first: teacher pre-enters
 * name+roll; student joins with roll number only. Name resolves from DB.
 */
export const attemptRoutes = new Hono<AppBindings>();

async function loadPaperQuestions(db: Database, examId: string): Promise<Question[]> {
  const items = await db
    .select()
    .from(schema.examPaperItems)
    .where(eq(schema.examPaperItems.examId, examId))
    .orderBy(asc(schema.examPaperItems.position));
  return items.map((it) => JSON.parse(it.snapshotJson) as Question);
}

type AnswerRow = typeof schema.answers.$inferSelect;

/** Score an attempt from the frozen paper + saved answers (re-graded from snapshots). */
async function scoreAttempt(db: Database, attemptId: string, examId: string) {
  const paperQuestions = await loadPaperQuestions(db, examId);
  const saved = await db.select().from(schema.answers).where(eq(schema.answers.attemptId, attemptId));
  const savedMap = new Map(saved.map((a) => [a.questionId, a]));

  let score = 0;
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  const maxScore = paperQuestions.reduce((s, q) => s + q.marks, 0);

  for (const q of paperQuestions) {
    const ans = savedMap.get(q.id);
    if (!ans) {
      unattempted++;
      continue;
    }
    let sel: string[] = [];
    try {
      sel = JSON.parse(ans.selectedJson as string) as string[];
    } catch {
      sel = [];
    }
    const g = gradeQuestion(q, { selectedOptionIds: sel, numericValue: ans.numericValue });
    score += g.awardedMarks;
    if (g.isCorrect === null) unattempted++;
    else if (g.isCorrect) correct++;
    else wrong++;
  }
  return { score, maxScore, correct, wrong, unattempted };
}

async function resolveAttempt(c: Context<AppBindings>, attemptId: string) {
  const attempt = await c
    .get("db")
    .select()
    .from(schema.attempts)
    .where(eq(schema.attempts.id, attemptId))
    .get();
  if (!attempt) throw notFound("Unknown attempt");
  return attempt;
}

/** Roll-only lookup: does this roll exist in this exam's batch? */
attemptRoutes.post("/lookup", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    joinCode?: string;
    rollNo?: string;
  } | null;
  if (!body?.joinCode || !body?.rollNo) throw badRequest("Enter your roll number");
  const db = c.get("db");
  const exam = await db.select().from(schema.exams).where(eq(schema.exams.joinCode, body.joinCode.trim())).get();
  if (!exam) throw notFound("That exam link is not valid");

  const normalized = normalizeRollNo(body.rollNo);
  const student = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.rollNoNormalized, normalized))
    .get();
  if (!student) {
    throw new ApiError(apiErrorCodes.notFound, "Roll number not found. Ask your teacher to add you to the batch.");
  }
  const membership = await db
    .select()
    .from(schema.batchStudents)
    .where(and(eq(schema.batchStudents.batchId, exam.batchId), eq(schema.batchStudents.studentId, student.id)))
    .get();
  if (!membership) {
    throw new ApiError(apiErrorCodes.notFound, "This roll number is not in this batch.");
  }
  return c.json({ data: { name: student.name, rollNo: student.rollNo } });
});

attemptRoutes.post("/join", async (c) => {
  const parsed = joinAttemptSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Enter your roll number");

  const { joinCode, rollNo, deviceToken } = parsed.data;
  const db = c.get("db");

  const exam = await db.select().from(schema.exams).where(eq(schema.exams.joinCode, joinCode)).get();
  if (!exam) throw notFound("That exam link is not valid");
  if (exam.status !== "published") {
    throw new ApiError(apiErrorCodes.windowClosed, "This exam is not open");
  }

  const now = Date.now();
  // Early is not the same as late: a student who arrives before the window
  // opens needs to know when to come back, not that the exam is "closed".
  if (now < exam.startsAt.getTime()) {
    throw new ApiError(apiErrorCodes.windowClosed, "This exam hasn't opened yet", {
      opensAt: [exam.startsAt.toISOString()],
    });
  }
  if (now >= exam.endsAt.getTime()) {
    throw new ApiError(apiErrorCodes.windowClosed, "This exam has ended");
  }

  // Roster-first: resolve name from DB, reject unknown rolls.
  const normalized = normalizeRollNo(rollNo);
  const studentRow = await db
    .select()
    .from(schema.students)
    .where(eq(schema.students.rollNoNormalized, normalized))
    .get();
  if (!studentRow) {
    throw new ApiError(apiErrorCodes.notFound, "Roll number not found. Ask your teacher to add you to the batch.");
  }
  const membership = await db
    .select()
    .from(schema.batchStudents)
    .where(and(eq(schema.batchStudents.batchId, exam.batchId), eq(schema.batchStudents.studentId, studentRow.id)))
    .get();
  if (!membership) {
    throw new ApiError(apiErrorCodes.notFound, "This roll number is not in this batch.");
  }
  const student = { id: studentRow.id, name: studentRow.name, rollNo: studentRow.rollNo };

  const existingAttempt = await db
    .select()
    .from(schema.attempts)
    .where(and(eq(schema.attempts.examId, exam.id), eq(schema.attempts.studentId, student.id)))
    .get();
  if (existingAttempt && existingAttempt.status !== "in_progress") {
    throw new ApiError(apiErrorCodes.alreadySubmitted, "You have already finished this exam", {
      attemptId: [existingAttempt.id],
    });
  }
  // Device lock: same attempt must come from same browser unless teacher allows.
  if (existingAttempt && exam.lockToDevice && existingAttempt.deviceToken && existingAttempt.deviceToken !== deviceToken) {
    throw new ApiError(apiErrorCodes.attemptLocked, "This exam is locked to the device you started on.", {
      attemptId: [existingAttempt.id],
    });
  }

  // Load frozen paper
  const paperQuestions = await loadPaperQuestions(db, exam.id);
  if (paperQuestions.length === 0) throw new ApiError(apiErrorCodes.windowClosed, "This exam has no questions");

  let attemptId = existingAttempt?.id;
  let questionOrder: string[];
  if (existingAttempt) {
    try {
      questionOrder = JSON.parse(existingAttempt.questionOrderJson as string) as string[];
    } catch {
      questionOrder = [];
    }
    if (questionOrder.length === 0) {
      questionOrder = paperQuestions.map((q) => q.id);
    }
  } else {
    attemptId = crypto.randomUUID();
    questionOrder = paperQuestions.map((q) => q.id);
    if (exam.shuffleQuestions) {
      // shuffle per student
      for (let i = questionOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = questionOrder[i]!;
        questionOrder[i] = questionOrder[j]!;
        questionOrder[j] = tmp;
      }
    }
    await db.insert(schema.attempts).values({
      id: attemptId,
      examId: exam.id,
      batchId: exam.batchId,
      studentId: student.id,
      status: "in_progress",
      deadlineAt: exam.endsAt,
      deviceToken,
      questionOrderJson: JSON.stringify(questionOrder),
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
    attemptId: attemptId!,
    studentId: student.id,
    name: student.name,
    rollNo: student.rollNo,
  });
  if (joined.status >= 400) return c.json(joined.data, joined.status as 400);

  // Sync D1 deadline with DO deadline (min of window + duration)
  const doDeadline = new Date((joined.data as { participant: { deadlineAt: number } }).participant.deadlineAt);
  await db.update(schema.attempts).set({ deadlineAt: doDeadline }).where(eq(schema.attempts.id, attemptId!));

  // Order paper per student, sanitize (strip answers)
  const byId = new Map(paperQuestions.map((q) => [q.id, q]));
  const ordered = questionOrder.map((id) => byId.get(id)).filter((q): q is Question => !!q);
  // include any new questions not in stored order (recompose edge)
  for (const q of paperQuestions) if (!questionOrder.includes(q.id)) ordered.push(q);

  const paper = ordered.map((q) => sanitizeForStudent(q, exam.shuffleOptions));

  // Existing answers for resume
  const savedAnswers = await db
    .select()
    .from(schema.answers)
    .where(eq(schema.answers.attemptId, attemptId!));
  const answersMap: Record<string, { selectedOptionIds: string[]; numericValue: number | null }> = {};
  for (const a of savedAnswers) {
    let sel: string[] = [];
    try {
      sel = JSON.parse(a.selectedJson as string) as string[];
    } catch {
      sel = [];
    }
    answersMap[a.questionId] = { selectedOptionIds: sel, numericValue: a.numericValue };
  }

  const maxScore = paperQuestions.reduce((s, q) => s + q.marks, 0);

  return c.json({
    data: {
      attemptId: attemptId!,
      student: { name: student.name, rollNo: student.rollNo },
      exam: { id: exam.id, title: exam.title, durationMinutes: exam.durationMinutes, maxScore },
      ...(joined.data as object),
      paper,
      answers: answersMap,
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
  const db = c.get("db");
  const attempt = await resolveAttempt(c, body.attemptId);
  if (attempt.status !== "in_progress") {
    throw new ApiError(apiErrorCodes.alreadySubmitted, "Attempt already closed");
  }
  if (Date.now() > attempt.deadlineAt.getTime()) {
    throw new ApiError(apiErrorCodes.windowClosed, "Time is up");
  }

  // Load the frozen snapshot for this question to grade
  const paperItem = await db
    .select()
    .from(schema.examPaperItems)
    .where(and(eq(schema.examPaperItems.examId, attempt.examId), eq(schema.examPaperItems.questionId, body.questionId)))
    .get();
  if (!paperItem) throw notFound("Question not in this exam");
  const snapshot = JSON.parse(paperItem.snapshotJson) as Question;
  // Also support legacy deserialize shape
  let fullQ: Question;
  try {
    fullQ = snapshot as Question;
  } catch {
    throw notFound("Bad snapshot");
  }

  const grade = gradeQuestion(fullQ, {
    selectedOptionIds: body.selectedOptionIds ?? [],
    numericValue: body.numericValue ?? null,
  });

  await db
    .insert(schema.answers)
    .values({
      attemptId: attempt.id,
      questionId: body.questionId,
      selectedJson: JSON.stringify(body.selectedOptionIds ?? []),
      numericValue: body.numericValue ?? null,
      isCorrect: grade.isCorrect,
      awardedMarks: grade.awardedMarks,
    })
    .onConflictDoUpdate({
      target: [schema.answers.attemptId, schema.answers.questionId],
      set: {
        selectedJson: JSON.stringify(body.selectedOptionIds ?? []),
        numericValue: body.numericValue ?? null,
        answeredAt: new Date(),
        isCorrect: grade.isCorrect,
        awardedMarks: grade.awardedMarks,
      },
    });

  // Best-effort presence update in DO
  await callExamSession(c.env, attempt.examId, "/answer", body).catch(() => undefined);

  // No verdict in the response: telling a student "wrong" as they tap an
  // option is the answer key by another name. Grading still happens and is
  // stored — it just stays hidden until reveal.
  return c.json({ data: { ok: true } });
});

attemptRoutes.post("/submit", async (c) => {
  const body = (await c.req.json().catch(() => null)) as { attemptId?: string } | null;
  if (!body?.attemptId) throw badRequest("Invalid submission");
  const db = c.get("db");
  const attempt = await resolveAttempt(c, body.attemptId);
  if (attempt.status !== "in_progress") {
    return c.json({ data: { ok: true, already: true } });
  }

  // Finalize scoring from frozen paper + saved answers
  const { score, maxScore } = await scoreAttempt(db, attempt.id, attempt.examId);

  // persist normalized grading per answer
  const paperQuestions = await loadPaperQuestions(db, attempt.examId);
  const saved = await db.select().from(schema.answers).where(eq(schema.answers.attemptId, attempt.id));
  const savedMap = new Map(saved.map((a) => [a.questionId, a]));
  for (const q of paperQuestions) {
    const ans = savedMap.get(q.id);
    if (!ans) continue;
    let sel: string[] = [];
    try {
      sel = JSON.parse(ans.selectedJson as string) as string[];
    } catch {
      sel = [];
    }
    const g = gradeQuestion(q, { selectedOptionIds: sel, numericValue: ans.numericValue });
    await db
      .update(schema.answers)
      .set({ isCorrect: g.isCorrect, awardedMarks: g.awardedMarks })
      .where(and(eq(schema.answers.attemptId, attempt.id), eq(schema.answers.questionId, q.id)));
  }

  await db
    .update(schema.attempts)
    .set({ status: "submitted", submittedAt: new Date(), score, maxScore })
    .where(eq(schema.attempts.id, attempt.id));

  await callExamSession(c.env, attempt.examId, "/submit", { attemptId: attempt.id }).catch(() => undefined);

  // Deliberately no score here. Marks are withheld until the teacher reveals
  // (GET /:id is the only place they exist, and only once released) — a
  // student should not be able to read their result off the network response
  // the instant they submit.
  return c.json({ data: { ok: true } });
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

/**
 * The per-question review a student may only see once their teacher has
 * released the paper: what they picked, what the answer actually was, what it
 * was worth, and the explanation if the bank has one.
 *
 * Options go through `sanitizeForStudent` (without shuffling) purely so a
 * true/false question that stored no options still has True/False to show —
 * at this point the correct answer is deliberately *included*.
 */
function buildReview(paperQuestions: Question[], saved: AnswerRow[]) {
  const byQ = new Map(saved.map((a) => [a.questionId, a]));
  return paperQuestions.map((q, position) => {
    const answer = byQ.get(q.id);
    let selected: string[] = [];
    try {
      selected = answer ? (JSON.parse(answer.selectedJson as string) as string[]) : [];
    } catch {
      selected = [];
    }
    return {
      position,
      questionId: q.id,
      type: q.type,
      prompt: q.prompt,
      mediaKey: q.mediaKey,
      marks: q.marks,
      options: sanitizeForStudent(q, false).options,
      correctOptionIds: q.correctOptionIds ?? [],
      correctNumber: q.correctNumber ?? null,
      numericTolerance: q.numericTolerance ?? null,
      explanation: q.explanation ?? null,
      yourSelectedOptionIds: selected,
      yourNumericValue: answer?.numericValue ?? null,
      isCorrect: answer?.isCorrect ?? null,
      awardedMarks: answer?.awardedMarks ?? 0,
    };
  });
}

async function loadAnswers(db: Database, attemptId: string) {
  return db.select().from(schema.answers).where(eq(schema.answers.attemptId, attemptId));
}

/** Read-only attempt state for resume / result screen. Scores and the answer
 *  key are withheld until the exam is revealed. */
attemptRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const attempt = await resolveAttempt(c, c.req.param("id"));
  const exam = await db.select().from(schema.exams).where(eq(schema.exams.id, attempt.examId)).get();
  const student = await db.select().from(schema.students).where(eq(schema.students.id, attempt.studentId)).get();
  const paperQuestions = await loadPaperQuestions(db, attempt.examId);
  const saved = await loadAnswers(db, attempt.id);
  const maxScore = paperQuestions.reduce((s, q) => s + q.marks, 0);

  /** Still writing? Never released, no matter what the teacher has done. */
  const released = attempt.status !== "in_progress" && !!exam?.revealedAt;
  const result = released ? await scoreAttempt(db, attempt.id, attempt.examId) : null;

  return c.json({
    data: {
      attempt: {
        id: attempt.id,
        status: attempt.status,
        score: released ? (attempt.score ?? result?.score ?? null) : null,
        submittedAt: attempt.submittedAt,
      },
      exam: exam ? { id: exam.id, title: exam.title } : null,
      student: student ? { name: student.name, rollNo: student.rollNo } : null,
      maxScore,
      answeredCount: saved.length,
      revealed: released,
      result,
      review: released ? buildReview(paperQuestions, saved) : null,
    },
  });
});
