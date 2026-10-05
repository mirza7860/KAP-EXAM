import { schema, type Database } from "@kap-exam/db";
import {
  questionInputSchema,
  topicInputSchema,
  topicUpdateSchema,
} from "@kap-exam/shared";
import { and, asc, desc, eq, inArray, isNull, like, sql } from "drizzle-orm";
import { Hono } from "hono";
import type { AppBindings } from "../env.js";
import { badRequest, notFound } from "../lib/http.js";
import { paginate, pageParams } from "../lib/pagination.js";
import { deserializeQuestion, serializeQuestion } from "../lib/question.js";

/**
 * Question bank: topics -> subtopics -> questions.
 *
 * Topics and subtopics are the *pools* an exam draws from: you can build an
 * exam straight from a subtopic (or a whole topic's subtree) by taking N random
 * questions. There is no separate "module" collection to maintain.
 */
export const topicRoutes = new Hono<AppBindings>();
export const questionRoutes = new Hono<AppBindings>();

function fields(error: { flatten: () => { fieldErrors: unknown } }) {
  return error.flatten().fieldErrors as Record<string, string[]>;
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

// ---------------------------------------------------------------------------
// Topics (self-referential: a topic with a parent is a subtopic)
// ---------------------------------------------------------------------------

topicRoutes.get("/", async (c) => {
  const rows = await c
    .get("db")
    .select()
    .from(schema.topics)
    .orderBy(asc(schema.topics.position), asc(schema.topics.name));
  return c.json({ data: rows });
});

/** Question counts per subtopic and per topic subtree — powers the picker. */
topicRoutes.get("/counts", async (c) => {
  const db = c.get("db");
  const bySubtopicRows = await db
    .select({ subtopicId: schema.questions.subtopicId, count: sql<number>`count(*)` })
    .from(schema.questions)
    .groupBy(schema.questions.subtopicId);
  const bySubtopic: Record<string, number> = {};
  for (const row of bySubtopicRows) bySubtopic[row.subtopicId] = Number(row.count);

  const topics = await db.select({ id: schema.topics.id }).from(schema.topics);
  const subtree: Record<string, number> = {};
  for (const topic of topics) {
    const ids = await topicSubtree(db, topic.id);
    subtree[topic.id] = ids.reduce((sum, id) => sum + (bySubtopic[id] ?? 0), 0);
  }

  return c.json({ data: { bySubtopic, subtree } });
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

/** Deletes the topic, its subtopics and every question inside them. */
topicRoutes.delete("/:id", async (c) => {
  const db = c.get("db");
  const ids = await topicSubtree(db, c.req.param("id"));
  await db.delete(schema.questions).where(inArray(schema.questions.subtopicId, ids));
  await db.delete(schema.topics).where(inArray(schema.topics.id, ids));
  return c.json({ data: { id: c.req.param("id"), topicsDeleted: ids.length } });
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

questionRoutes.get("/", async (c) => {
  const db = c.get("db");
  const subtopicId = c.req.query("subtopicId");
  const topicId = c.req.query("topicId");
  const search = c.req.query("search");
  const page = pageParams(c);

  const conditions = [];
  if (subtopicId) conditions.push(eq(schema.questions.subtopicId, subtopicId));
  if (topicId) conditions.push(inArray(schema.questions.subtopicId, await topicSubtree(db, topicId)));
  if (search) conditions.push(like(schema.questions.prompt, `%${search}%`));
  const where = conditions.length ? and(...conditions) : undefined;

  const totalRow = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.questions)
    .where(where)
    .get();
  const total = Number(totalRow?.n ?? 0);

  const rows =
    total === 0
      ? []
      : await db
          .select()
          .from(schema.questions)
          .where(where)
          .orderBy(desc(schema.questions.createdAt))
          .limit(page.limit)
          .offset(page.offset);

  return c.json({ data: paginate(rows.map(deserializeQuestion), total, page) });
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
