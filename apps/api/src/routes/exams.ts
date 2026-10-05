import { schema, type Database } from "@kap-exam/db";
import {
  examComposeSchema,
  examCreateSchema,
  examUpdateSchema,
  type Question,
} from "@kap-exam/shared";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { callExamSession } from "../lib/durable.js";
import { badRequest, notFound } from "../lib/http.js";
import { paginate, pageParams } from "../lib/pagination.js";
import { deserializeQuestion } from "../lib/question.js";
import { scoreAttempts } from "../lib/scoring.js";

/**
 * Exams.
 *
 * Compose writes `exam_paper_items` (a snapshot of each question). Publish only
 * flips the status — the paper is already frozen, so a report card can never
 * change because the bank was edited afterwards.
 */
export const examRoutes = new Hono<AppBindings>();

function fields(error: { flatten: () => { fieldErrors: unknown } }) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/** One row on the projected leaderboard. `rank` is filled in after sorting. */
interface LeaderboardEntry {
  rank: number;
  attemptId: string;
  studentId: string;
  name: string;
  rollNo: string;
  status: string;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unattempted: number;
  violationCount: number;
  submittedAt: number;
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(length = 8): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let code = "";
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  return code;
}

/** All topic ids in the subtree rooted at `rootId` (inclusive). */
async function topicSubtree(db: Database, rootId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.topics.id, parentId: schema.topics.parentId })
    .from(schema.topics);
  const ids = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parentId && ids.has(row.parentId) && !ids.has(row.id)) {
        ids.add(row.id);
        changed = true;
      }
    }
  }
  return [...ids];
}

/** Randomly take `count` ids (or all of them when count is omitted). */
function shufflePick(ids: string[], count?: number): string[] {
  if (count === undefined || count >= ids.length) return ids;
  const copy = [...ids];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy.slice(0, count);
}

async function uniqueJoinCode(db: Database): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = randomCode();
    const existing = await db
      .select({ id: schema.exams.id })
      .from(schema.exams)
      .where(eq(schema.exams.joinCode, code))
      .get();
    if (!existing) return code;
  }
  return randomCode(12);
}

/** The frozen paper: each row is a full question snapshot taken at compose time. */
async function loadPaper(db: Database, examId: string) {
  const items = await db
    .select()
    .from(schema.examPaperItems)
    .where(eq(schema.examPaperItems.examId, examId))
    .orderBy(asc(schema.examPaperItems.position));
  return items.map((item) => ({
    position: item.position,
    questionId: item.questionId,
    marks: item.marks,
    question: JSON.parse(item.snapshotJson) as Question,
  }));
}

examRoutes.get("/", async (c) => {
  const db = c.get("db");
  const page = pageParams(c);

  const totalRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.exams)
    .get();
  const total = Number(totalRow?.n ?? 0);

  const rows =
    total === 0
      ? []
      : await db
          .select()
          .from(schema.exams)
          .orderBy(desc(schema.exams.createdAt))
          .limit(page.limit)
          .offset(page.offset);

  const pageIds = rows.map((row) => row.id);
  const batchRows = await db
    .select({ id: schema.batches.id, name: schema.batches.name })
    .from(schema.batches);
  const batchName = new Map(batchRows.map((row) => [row.id, row.name]));

  // Counts only for the page we are actually returning.
  const counts = pageIds.length
    ? await db
        .select({ examId: schema.examPaperItems.examId, count: sql<number>`count(*)` })
        .from(schema.examPaperItems)
        .where(inArray(schema.examPaperItems.examId, pageIds))
        .groupBy(schema.examPaperItems.examId)
    : [];
  const countMap = new Map(counts.map((row) => [row.examId, Number(row.count)]));

  return c.json({
    data: paginate(
      rows.map((row) => ({
        ...row,
        batchName: batchName.get(row.batchId) ?? "Unknown batch",
        questionCount: countMap.get(row.id) ?? 0,
      })),
      total,
      page,
    ),
  });
});

examRoutes.post("/", async (c) => {
  const parsed = examCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid exam", fields(parsed.error));

  const db = c.get("db");
  const batch = await db
    .select({ id: schema.batches.id })
    .from(schema.batches)
    .where(eq(schema.batches.id, parsed.data.batchId))
    .get();
  if (!batch) throw notFound("Batch not found");

  const id = crypto.randomUUID();
  const joinCode = await uniqueJoinCode(db);
  const { schedule } = parsed.data;

  await db.insert(schema.exams).values({
    id,
    batchId: parsed.data.batchId,
    title: parsed.data.title,
    status: "draft",
    startsAt: schedule.startsAt,
    endsAt: schedule.endsAt,
    durationMinutes: schedule.durationMinutes,
    joinCode,
    shuffleQuestions: parsed.data.shuffleQuestions,
    shuffleOptions: parsed.data.shuffleOptions,
    lockToDevice: parsed.data.lockToDevice,
  });

  const row = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  return c.json({ data: { ...row, questionCount: 0 } }, 201);
});

examRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const exam = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  if (!exam) throw notFound("Exam not found");

  const batch = await db
    .select({ name: schema.batches.name })
    .from(schema.batches)
    .where(eq(schema.batches.id, exam.batchId))
    .get();
  const paper = await loadPaper(db, id);
  const maxScore = paper.reduce((sum, item) => sum + item.marks, 0);

  return c.json({ data: { ...exam, batchName: batch?.name ?? "", paper, maxScore } });
});

examRoutes.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const exam = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  if (!exam) throw notFound("Exam not found");
  if (exam.status !== "draft") throw badRequest("Only a draft exam can be edited");

  const parsed = examUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid exam", fields(parsed.error));

  const { schedule, ...rest } = parsed.data;
  await db
    .update(schema.exams)
    .set({
      ...rest,
      ...(schedule
        ? {
            startsAt: schedule.startsAt,
            endsAt: schedule.endsAt,
            durationMinutes: schedule.durationMinutes,
          }
        : {}),
    })
    .where(eq(schema.exams.id, id));

  const row = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  return c.json({ data: row });
});

/** Compose (or recompose) the draft paper. Snapshots questions immediately. */
examRoutes.post("/:id/compose", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const exam = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  if (!exam) throw notFound("Exam not found");
  if (exam.status !== "draft") throw badRequest("Only a draft exam can be composed");

  const parsed = examComposeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid composition", fields(parsed.error));

  // Resolve each source to question ids, preserving order, then de-duplicate.
  const ordered: string[] = [];
  for (const source of parsed.data.sources) {
    if (source.kind === "questions") {
      ordered.push(...source.questionIds);
      continue;
    }
    const subtopicIds =
      source.kind === "subtopic" ? [source.subtopicId] : await topicSubtree(db, source.topicId);
    const rows = await db
      .select({ id: schema.questions.id })
      .from(schema.questions)
      .where(inArray(schema.questions.subtopicId, subtopicIds));
    ordered.push(...shufflePick(rows.map((row) => row.id), source.count));
  }

  const uniqueIds = [...new Set(ordered)];
  if (uniqueIds.length === 0) throw badRequest("Add at least one question");

  const questions = await db
    .select()
    .from(schema.questions)
    .where(inArray(schema.questions.id, uniqueIds));
  if (questions.length === 0) throw badRequest("None of the questions were found");
  const byId = new Map(questions.map((row) => [row.id, row]));

  await db.delete(schema.examPaperItems).where(eq(schema.examPaperItems.examId, id));
  const values = uniqueIds
    .map((questionId, index) => {
      const row = byId.get(questionId);
      if (!row) return null;
      const question = deserializeQuestion(row);
      return {
        examId: id,
        position: index,
        questionId,
        snapshotJson: JSON.stringify(question),
        marks: question.marks,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  if (values.length > 0) await db.insert(schema.examPaperItems).values(values);

  const paper = await loadPaper(db, id);
  const maxScore = paper.reduce((sum, item) => sum + item.marks, 0);
  return c.json({ data: { questionCount: paper.length, maxScore, paper } });
});

examRoutes.post("/:id/publish", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const exam = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  if (!exam) throw notFound("Exam not found");
  if (exam.status === "published") return c.json({ data: exam });

  const paper = await loadPaper(db, id);
  if (paper.length === 0) throw badRequest("Add questions before publishing");
  if (new Date(exam.endsAt).getTime() <= Date.now()) {
    throw badRequest("The exam window is already in the past");
  }

  await db
    .update(schema.exams)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(schema.exams.id, id));
  const row = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  return c.json({ data: row });
});

examRoutes.post("/:id/close", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const exam = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  if (!exam) throw notFound("Exam not found");

  await db
    .update(schema.exams)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(schema.exams.id, id));
  // Tell the Durable Object to time out anyone still working.
  await callExamSession(c.env, id, "/close", {}).catch(() => undefined);

  const row = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  return c.json({ data: row });
});

/**
 * Release the answer key. One way by design — the instant this is stamped the
 * API stops withholding scores and correct answers from students, and there is
 * no route to take it back down (an answer key that can be recalled is an
 * answer key students screenshot first).
 *
 * Timing is the teacher's call: if everyone has finished, they may reveal.
 */
examRoutes.post("/:id/reveal", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const exam = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  if (!exam) throw notFound("Exam not found");
  if (exam.status === "draft") throw badRequest("Publish the exam before revealing answers");
  if (exam.revealedAt) return c.json({ data: exam });

  await db.update(schema.exams).set({ revealedAt: new Date() }).where(eq(schema.exams.id, id));
  const row = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  return c.json({ data: row });
});

/**
 * Ranked cohort for the classroom display. Only students who actually
 * finished are on the board; ties share a rank. Graded with the same
 * `scoreAttempts` the report card uses.
 */
examRoutes.get("/:id/leaderboard", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const exam = await db.select().from(schema.exams).where(eq(schema.exams.id, id)).get();
  if (!exam) throw notFound("Exam not found");

  const attempts = await db.select().from(schema.attempts).where(eq(schema.attempts.examId, id));
  const seated = await db
    .select({ studentId: schema.batchStudents.studentId })
    .from(schema.batchStudents)
    .where(eq(schema.batchStudents.batchId, exam.batchId));

  const finished = attempts.filter((a) => a.status !== "in_progress" && a.status !== "abandoned");
  if (finished.length === 0) {
    return c.json({
      data: {
        examId: id,
        revealedAt: exam.revealedAt,
        cohortSize: seated.length,
        appeared: 0,
        maxScore: 0,
        entries: [],
      },
    });
  }

  const students = await db
    .select()
    .from(schema.students)
    .where(inArray(schema.students.id, finished.map((a) => a.studentId)));
  const byStudent = new Map(students.map((s) => [s.id, s]));
  const scores = await scoreAttempts(db, finished.map((a) => ({ id: a.id, examId: a.examId })));

  const entries: LeaderboardEntry[] = finished.map((a) => {
    const student = byStudent.get(a.studentId);
    const sc = scores.get(a.id) ?? { score: 0, maxScore: 0, correct: 0, wrong: 0, unattempted: 0 };
    return {
      rank: 0,
      attemptId: a.id,
      studentId: a.studentId,
      name: student?.name ?? "Unknown",
      rollNo: student?.rollNo ?? "",
      status: a.status,
      score: a.score ?? sc.score,
      maxScore: sc.maxScore,
      correct: sc.correct,
      wrong: sc.wrong,
      unattempted: sc.unattempted,
      violationCount: a.violationCount ?? 0,
      submittedAt: a.submittedAt ? a.submittedAt.getTime() : Number.MAX_SAFE_INTEGER,
    };
  });

  entries.sort((a, b) => b.score - a.score || a.submittedAt - b.submittedAt || a.rollNo.localeCompare(b.rollNo));

  let rank = 0;
  let previous: number | null = null;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    if (entry.score !== previous) {
      rank = i + 1;
      previous = entry.score;
    }
    entry.rank = rank;
  }

  return c.json({
    data: {
      examId: id,
      revealedAt: exam.revealedAt,
      cohortSize: seated.length,
      appeared: entries.length,
      maxScore: entries.reduce((m, e) => Math.max(m, e.maxScore), 0),
      entries,
    },
  });
});

/** Live roster + violations, read straight from the exam's Durable Object. */
examRoutes.get("/:id/live", async (c) => {
  const stub = c.env.EXAM_SESSION.get(c.env.EXAM_SESSION.idFromName(c.req.param("id")));
  const response = await stub.fetch("https://exam-session/state");
  const state = (await response.json()) as unknown;
  return c.json({ data: state });
});

/**
 * Let a student back in after the exit limit locked them out. The lock is a
 * deterrent, not a verdict - a phone call can background the app, so the
 * teacher has to be able to undo it.
 */
examRoutes.post("/:id/participants/:attemptId/unlock", async (c) => {
  const result = await callExamSession(c.env, c.req.param("id"), "/unlock", {
    attemptId: c.req.param("attemptId"),
  });
  if (result.status >= 400) return c.json(result.data, result.status as 400);
  return c.json({ data: { ok: true } });
});
