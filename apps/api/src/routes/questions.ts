import { schema, type Database } from "@kap-exam/db";
import {
  moduleInputSchema,
  moduleQuestionsInputSchema,
  moduleUpdateSchema,
  questionInputSchema,
  topicInputSchema,
  topicUpdateSchema,
} from "@kap-exam/shared";
import { and, asc, desc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { badRequest, notFound } from "../lib/http.js";
import { deserializeQuestion, serializeQuestion } from "../lib/question.js";

/**
 * Question bank: topics -> subtopics -> questions, plus reusable modules.
 * Everything here is behind `requireTeacher` (applied where it is mounted).
 */

function fields(error: { flatten: () => { fieldErrors: unknown } }) {
  return error.flatten().fieldErrors as Record<string, string[]>;
}

/**
 * Delete a topic, its subtopics, and every question inside them.
 *
 * This is a real delete, not an archive: exams snapshot their questions into
 * `exam_paper_items`, so removing a question from the bank can never rewrite a
 * past report card.
 */
async function deleteTopicSubtree(db: Database, rootId: string): Promise<number> {
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

  const list = [...ids];
  await db.delete(schema.questions).where(inArray(schema.questions.subtopicId, list));
  await db.delete(schema.topics).where(inArray(schema.topics.id, list));
  return list.length;
}

// ---------------------------------------------------------------------------
// Topics (self-referential: a topic with a parent is a subtopic)
// ---------------------------------------------------------------------------

export const topicRoutes = new Hono<AppBindings>();

topicRoutes.get("/", async (c) => {
  const includeArchived = c.req.query("includeArchived") === "true";
  const rows = await c
    .get("db")
    .select()
    .from(schema.topics)
    .where(includeArchived ? undefined : isNull(schema.topics.archivedAt))
    .orderBy(asc(schema.topics.position), asc(schema.topics.name));
  return c.json({ data: rows });
});

topicRoutes.post("/", async (c) => {
  const parsed = topicInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid topic", fields(parsed.error));

  const db = c.get("db");
  if (parsed.data.parentId) {
    const parent = await db
      .select({ id: schema.topics.id })
      .from(schema.topics)
      .where(eq(schema.topics.id, parsed.data.parentId))
      .get();
    if (!parent) throw notFound("Parent topic not found");
  }

  const row = { id: crypto.randomUUID(), ...parsed.data };
  await db.insert(schema.topics).values(row);
  return c.json({ data: row }, 201);
});

topicRoutes.patch("/:id", async (c) => {
  const parsed = topicUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid topic", fields(parsed.error));
  if (parsed.data.parentId === c.req.param("id")) {
    throw badRequest("A topic cannot be its own parent");
  }

  const db = c.get("db");
  await db.update(schema.topics).set(parsed.data).where(eq(schema.topics.id, c.req.param("id")));
  const row = await db
    .select()
    .from(schema.topics)
    .where(eq(schema.topics.id, c.req.param("id")))
    .get();
  if (!row) throw notFound("Topic not found");
  return c.json({ data: row });
});

topicRoutes.delete("/:id", async (c) => {
  const deleted = await deleteTopicSubtree(c.get("db"), c.req.param("id"));
  return c.json({ data: { id: c.req.param("id"), topicsDeleted: deleted } });
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const questionRoutes = new Hono<AppBindings>();

questionRoutes.get("/", async (c) => {
  const db = c.get("db");
  const subtopicId = c.req.query("subtopicId");
  const search = c.req.query("search");
  const includeArchived = c.req.query("includeArchived") === "true";
  const limit = Math.min(Number(c.req.query("limit") ?? 50) || 50, 200);
  const offset = Math.max(Number(c.req.query("offset") ?? 0) || 0, 0);

  const conditions = [];
  if (subtopicId) conditions.push(eq(schema.questions.subtopicId, subtopicId));
  if (!includeArchived) conditions.push(isNull(schema.questions.archivedAt));
  if (search) conditions.push(like(schema.questions.prompt, `%${search}%`));

  const rows = await db
    .select()
    .from(schema.questions)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.questions.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ data: rows.map(deserializeQuestion) });
});

questionRoutes.post("/", async (c) => {
  const parsed = questionInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid question", fields(parsed.error));

  const db = c.get("db");
  const topic = await db
    .select({ id: schema.topics.id })
    .from(schema.topics)
    .where(eq(schema.topics.id, parsed.data.subtopicId))
    .get();
  if (!topic) throw notFound("Subtopic not found");

  const id = crypto.randomUUID();
  await db.insert(schema.questions).values({
    id,
    subtopicId: parsed.data.subtopicId,
    type: parsed.data.type,
    prompt: parsed.data.prompt,
    mediaKey: parsed.data.mediaKey,
    marks: parsed.data.marks,
    negativeMarks: parsed.data.negativeMarks,
    explanation: parsed.data.explanation,
    ...serializeQuestion(parsed.data),
  });

  const row = await db.select().from(schema.questions).where(eq(schema.questions.id, id)).get();
  if (!row) throw notFound("Question not found after create");
  return c.json({ data: deserializeQuestion(row) }, 201);
});

questionRoutes.get("/:id", async (c) => {
  const row = await c
    .get("db")
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.id, c.req.param("id")))
    .get();
  if (!row) throw notFound("Question not found");
  return c.json({ data: deserializeQuestion(row) });
});

questionRoutes.patch("/:id", async (c) => {
  const parsed = questionInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid question", fields(parsed.error));

  const db = c.get("db");
  await db
    .update(schema.questions)
    .set({
      subtopicId: parsed.data.subtopicId,
      type: parsed.data.type,
      prompt: parsed.data.prompt,
      mediaKey: parsed.data.mediaKey,
      marks: parsed.data.marks,
      negativeMarks: parsed.data.negativeMarks,
      explanation: parsed.data.explanation,
      updatedAt: new Date(),
      ...serializeQuestion(parsed.data),
    })
    .where(eq(schema.questions.id, c.req.param("id")));

  const row = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.id, c.req.param("id")))
    .get();
  if (!row) throw notFound("Question not found");
  return c.json({ data: deserializeQuestion(row) });
});

questionRoutes.delete("/:id", async (c) => {
  await c.get("db").delete(schema.questions).where(eq(schema.questions.id, c.req.param("id")));
  return c.json({ data: { id: c.req.param("id"), deleted: true } });
});

// ---------------------------------------------------------------------------
// Reusable modules ("like Google Drive")
// ---------------------------------------------------------------------------

export const moduleRoutes = new Hono<AppBindings>();

moduleRoutes.get("/", async (c) => {
  const db = c.get("db");
  const includeArchived = c.req.query("includeArchived") === "true";

  const rows = await db
    .select()
    .from(schema.questionModules)
    .where(includeArchived ? undefined : isNull(schema.questionModules.archivedAt))
    .orderBy(asc(schema.questionModules.name));

  const counts = await db
    .select({ moduleId: schema.moduleQuestions.moduleId, count: sql<number>`count(*)` })
    .from(schema.moduleQuestions)
    .groupBy(schema.moduleQuestions.moduleId);
  const countMap = new Map(counts.map((row) => [row.moduleId, Number(row.count)]));

  return c.json({
    data: rows.map((row) => ({ ...row, questionCount: countMap.get(row.id) ?? 0 })),
  });
});

moduleRoutes.post("/", async (c) => {
  const parsed = moduleInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid module", fields(parsed.error));

  const row = { id: crypto.randomUUID(), ...parsed.data };
  await c.get("db").insert(schema.questionModules).values(row);
  return c.json({ data: { ...row, questionCount: 0 } }, 201);
});

moduleRoutes.get("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const module = await db
    .select()
    .from(schema.questionModules)
    .where(eq(schema.questionModules.id, id))
    .get();
  if (!module) throw notFound("Module not found");

  const items = await db
    .select({ questionId: schema.moduleQuestions.questionId, position: schema.moduleQuestions.position })
    .from(schema.moduleQuestions)
    .where(eq(schema.moduleQuestions.moduleId, id))
    .orderBy(asc(schema.moduleQuestions.position));

  const ids = items.map((item) => item.questionId);
  const questions = ids.length
    ? await db.select().from(schema.questions).where(inArray(schema.questions.id, ids))
    : [];
  const byId = new Map(questions.map((row) => [row.id, row]));

  return c.json({
    data: {
      ...module,
      questionCount: ids.length,
      questions: ids
        .map((questionId) => byId.get(questionId))
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .map(deserializeQuestion),
    },
  });
});

moduleRoutes.patch("/:id", async (c) => {
  const parsed = moduleUpdateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid module", fields(parsed.error));

  const db = c.get("db");
  await db
    .update(schema.questionModules)
    .set(parsed.data)
    .where(eq(schema.questionModules.id, c.req.param("id")));
  const row = await db
    .select()
    .from(schema.questionModules)
    .where(eq(schema.questionModules.id, c.req.param("id")))
    .get();
  if (!row) throw notFound("Module not found");
  return c.json({ data: row });
});

moduleRoutes.delete("/:id", async (c) => {
  await c
    .get("db")
    .delete(schema.questionModules)
    .where(eq(schema.questionModules.id, c.req.param("id")));
  return c.json({ data: { id: c.req.param("id"), deleted: true } });
});

moduleRoutes.post("/:id/questions", async (c) => {
  const parsed = moduleQuestionsInputSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) throw badRequest("Invalid question list", fields(parsed.error));

  const db = c.get("db");
  const moduleId = c.req.param("id");
  const module = await db
    .select({ id: schema.questionModules.id })
    .from(schema.questionModules)
    .where(eq(schema.questionModules.id, moduleId))
    .get();
  if (!module) throw notFound("Module not found");

  const last = await db
    .select({ position: schema.moduleQuestions.position })
    .from(schema.moduleQuestions)
    .where(eq(schema.moduleQuestions.moduleId, moduleId))
    .orderBy(desc(schema.moduleQuestions.position))
    .limit(1);
  let position = (last[0]?.position ?? -1) + 1;

  await db
    .insert(schema.moduleQuestions)
    .values(parsed.data.questionIds.map((questionId) => ({ moduleId, questionId, position: position++ })))
    .onConflictDoNothing();

  return c.json({ data: { moduleId, added: parsed.data.questionIds.length } });
});

moduleRoutes.delete("/:id/questions/:questionId", async (c) => {
  await c
    .get("db")
    .delete(schema.moduleQuestions)
    .where(
      and(
        eq(schema.moduleQuestions.moduleId, c.req.param("id")),
        eq(schema.moduleQuestions.questionId, c.req.param("questionId")),
      ),
    );
  return c.json({ data: { ok: true } });
});
