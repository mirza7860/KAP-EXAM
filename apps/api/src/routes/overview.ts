import { schema } from "@kap-exam/db";
import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppBindings } from "../env.js";

/**
 * Dashboard overview: the numbers a teacher wants on landing, in one call.
 * Read-only aggregation over D1.
 */
export const overviewRoutes = new Hono<AppBindings>();

overviewRoutes.get("/", async (c) => {
  const db = c.get("db");
  const now = new Date();

  const count = async (query: Promise<{ count: number }[]>) => Number((await query)[0]?.count ?? 0);

  const [topics, questions, batches, students] = await Promise.all([
    count(db.select({ count: sql<number>`count(*)` }).from(schema.topics)),
    count(db.select({ count: sql<number>`count(*)` }).from(schema.questions)),
    count(db.select({ count: sql<number>`count(*)` }).from(schema.batches)),
    count(db.select({ count: sql<number>`count(*)` }).from(schema.students)),
  ]);

  const examRows = await db
    .select({ status: schema.exams.status, count: sql<number>`count(*)` })
    .from(schema.exams)
    .groupBy(schema.exams.status);
  const examsByStatus = { draft: 0, published: 0, closed: 0 };
  for (const row of examRows) examsByStatus[row.status] = Number(row.count);

  // Live right now: published and inside the window.
  const liveNow = await count(
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.exams)
      .where(
        and(
          eq(schema.exams.status, "published"),
          lte(schema.exams.startsAt, now),
          gt(schema.exams.endsAt, now),
        ),
      ),
  );

  // Upcoming: published, opens in the future.
  const upcoming = await count(
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.exams)
      .where(and(eq(schema.exams.status, "published"), gt(schema.exams.startsAt, now))),
  );

  const studentCounts = await db
    .select({ batchId: schema.batchStudents.batchId, count: sql<number>`count(*)` })
    .from(schema.batchStudents)
    .groupBy(schema.batchStudents.batchId);
  const studentByBatch = new Map(studentCounts.map((r) => [r.batchId, Number(r.count)]));

  const recentExamRows = await db
    .select()
    .from(schema.exams)
    .orderBy(desc(schema.exams.createdAt))
    .limit(5);
  const batchRows = await db
    .select({ id: schema.batches.id, name: schema.batches.name })
    .from(schema.batches);
  const batchName = new Map(batchRows.map((b) => [b.id, b.name]));
  const paperCounts = await db
    .select({ examId: schema.examPaperItems.examId, count: sql<number>`count(*)` })
    .from(schema.examPaperItems)
    .groupBy(schema.examPaperItems.examId);
  const paperByExam = new Map(paperCounts.map((r) => [r.examId, Number(r.count)]));

  const recentExams = recentExamRows.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    batchName: batchName.get(e.batchId) ?? "",
    questionCount: paperByExam.get(e.id) ?? 0,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    joinCode: e.joinCode,
  }));

  // Whatever is live or next — the thing a teacher would act on.
  const focusRows = await db
    .select()
    .from(schema.exams)
    .where(eq(schema.exams.status, "published"))
    .orderBy(asc(schema.exams.startsAt))
    .limit(10);
  const focus =
    focusRows
      .filter((e) => e.endsAt.getTime() > now.getTime())
      .map((e) => ({
        id: e.id,
        title: e.title,
        batchName: batchName.get(e.batchId) ?? "",
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        joinCode: e.joinCode,
        live: e.startsAt.getTime() <= now.getTime(),
        studentCount: studentByBatch.get(e.batchId) ?? 0,
      }))
      .slice(0, 3);

  return c.json({
    data: {
      counts: { topics, questions, batches, students },
      exams: { ...examsByStatus, liveNow, upcoming },
      recentExams,
      focus,
    },
  });
});
