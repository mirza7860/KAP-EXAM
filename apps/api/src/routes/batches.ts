import { schema } from "@kap-exam/db";
import { createBatchSchema, normalizeRollNo, updateBatchSchema } from "@kap-exam/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { badRequest, notFound } from "../lib/http.js";
import { paginate, pageParams } from "../lib/pagination.js";

/**
 * Batches = semester cohorts.
 *
 * Copying a batch copies the roster and display settings, never past exams or
 * reports (those stay attached to the original batch id). That is what lets a
 * teacher roll "2026 Sem 1" into "2026 Sem 2" without corrupting history.
 */
export const batchRoutes = new Hono<AppBindings>();

function fields(error: { flatten: () => { fieldErrors: unknown } }) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

batchRoutes.get("/", async (c) => {
  const db = c.get("db");
  const includeArchived = c.req.query("includeArchived") === "true";

  const rows = await db
    .select()
    .from(schema.batches)
    .where(includeArchived ? undefined : isNull(schema.batches.archivedAt))
    .orderBy(asc(schema.batches.name));

  const counts = await db
    .select({ batchId: schema.batchStudents.batchId, count: sql<number>`count(*)` })
    .from(schema.batchStudents)
    .groupBy(schema.batchStudents.batchId);
  const countMap = new Map(counts.map((row) => [row.batchId, Number(row.count)]));

  return c.json({
    data: rows.map((row) => ({ ...row, studentCount: countMap.get(row.id) ?? 0 })),
  });
});

batchRoutes.post("/", async (c) => {
  const parsed = createBatchSchema().safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid batch", fields(parsed.error));

  const db = c.get("db");
  const { name, description, copyFromBatchId, copyRoster } = parsed.data;

  if (copyFromBatchId) {
    const source = await db
      .select({ id: schema.batches.id })
      .from(schema.batches)
      .where(eq(schema.batches.id, copyFromBatchId))
      .get();
    if (!source) throw notFound("Batch to copy not found");
  }

  const id = crypto.randomUUID();
  await db.insert(schema.batches).values({
    id,
    name,
    description: description ?? null,
    copiedFromBatchId: copyFromBatchId ?? null,
  });

  // Copy the roster only. Exams and reports deliberately stay behind.
  let studentCount = 0;
  if (copyFromBatchId && copyRoster) {
    const roster = await db
      .select({ studentId: schema.batchStudents.studentId })
      .from(schema.batchStudents)
      .where(eq(schema.batchStudents.batchId, copyFromBatchId));
    if (roster.length > 0) {
      await db
        .insert(schema.batchStudents)
        .values(roster.map((row) => ({ batchId: id, studentId: row.studentId })))
        .onConflictDoNothing();
      studentCount = roster.length;
    }
  }

  return c.json({ data: { id, name, description: description ?? null, studentCount } }, 201);
});

batchRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const batch = await db.select().from(schema.batches).where(eq(schema.batches.id, id)).get();
  if (!batch) throw notFound("Batch not found");

  // The roster is served by GET /:id/students (paginated) — a batch can hold
  // hundreds of students and the detail call only needs the headcount.
  const countRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.batchStudents)
    .where(eq(schema.batchStudents.batchId, id))
    .get();

  return c.json({ data: { ...batch, studentCount: Number(countRow?.n ?? 0) } });
});

batchRoutes.patch("/:id", async (c) => {
  const parsed = updateBatchSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid batch", fields(parsed.error));

  const db = c.get("db");
  await db.update(schema.batches).set(parsed.data).where(eq(schema.batches.id, c.req.param("id")));
  const row = await db
    .select()
    .from(schema.batches)
    .where(eq(schema.batches.id, c.req.param("id")))
    .get();
  if (!row) throw notFound("Batch not found");
  return c.json({ data: row });
});

batchRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  // Hard delete. Exams cascade via FK (exams.batchId onDelete cascade),
  // which cascades to paper, attempts, answers, violations.
  // Students are global and survive; only the membership is removed via cascade.
  await db.delete(schema.batchStudents).where(eq(schema.batchStudents.batchId, id));
  await db.delete(schema.exams).where(eq(schema.exams.batchId, id));
  await db.delete(schema.batches).where(eq(schema.batches.id, id));
  return c.json({ data: { id, deleted: true } });
});

batchRoutes.get("/:id/students", async (c) => {
  const db = c.get("db");
  const batchId = c.req.param("id");
  const page = pageParams(c);

  const totalRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.batchStudents)
    .where(eq(schema.batchStudents.batchId, batchId))
    .get();
  const total = Number(totalRow?.n ?? 0);

  const roster =
    total === 0
      ? []
      : await db
          .select({
            studentId: schema.students.id,
            name: schema.students.name,
            rollNo: schema.students.rollNo,
            joinedAt: schema.batchStudents.joinedAt,
          })
          .from(schema.batchStudents)
          .innerJoin(schema.students, eq(schema.batchStudents.studentId, schema.students.id))
          .where(eq(schema.batchStudents.batchId, batchId))
          .orderBy(asc(schema.students.rollNo))
          .limit(page.limit)
          .offset(page.offset);

  return c.json({ data: paginate(roster, total, page) });
});

/** Add a student by id (existing person) or by name+roll (upsert a person). */
batchRoutes.post("/:id/students", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { studentId?: string; name?: string; rollNo?: string }
    | null;
  if (!body) throw badRequest("Invalid student");

  const db = c.get("db");
  const batchId = c.req.param("id");
  const batch = await db
    .select({ id: schema.batches.id })
    .from(schema.batches)
    .where(eq(schema.batches.id, batchId))
    .get();
  if (!batch) throw notFound("Batch not found");

  let studentId = body.studentId;
  if (!studentId) {
    if (!body.name?.trim() || !body.rollNo?.trim()) {
      throw badRequest("Provide a studentId, or a name and roll number");
    }
    const normalized = normalizeRollNo(body.rollNo);
    const existing = await db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(eq(schema.students.rollNoNormalized, normalized))
      .get();
    if (existing) {
      studentId = existing.id;
    } else {
      studentId = crypto.randomUUID();
      await db.insert(schema.students).values({
        id: studentId,
        name: body.name.trim(),
        rollNo: body.rollNo.trim(),
        rollNoNormalized: normalized,
      });
    }
  }

  await db
    .insert(schema.batchStudents)
    .values({ batchId, studentId })
    .onConflictDoNothing();

  return c.json({ data: { batchId, studentId } }, 201);
});

batchRoutes.delete("/:id/students/:studentId", async (c) => {
  await c
    .get("db")
    .delete(schema.batchStudents)
    .where(
      and(
        eq(schema.batchStudents.batchId, c.req.param("id")),
        eq(schema.batchStudents.studentId, c.req.param("studentId")),
      ),
    );
  return c.json({ data: { ok: true } });
});
