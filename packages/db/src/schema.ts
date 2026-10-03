import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * KAP EXAM schema (Cloudflare D1 / SQLite).
 *
 * Two invariants this schema is built to protect:
 *  1. History is immutable. An exam snapshots its paper in `exam_paper_items`,
 *     so editing a question later never rewrites a past report card.
 *  2. A student is a stable person across semesters. Identity is the pair
 *     (roll_no_normalized) matched globally; batches are time slices, joined
 *     through `batch_students`. That is what makes a report card span semesters.
 */

const now = sql`(unixepoch())`;
const ts = (name: string) => integer(name, { mode: "timestamp" });

// ---------------------------------------------------------------------------
// Teachers
// ---------------------------------------------------------------------------

export const teachers = sqliteTable(
  "teachers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["owner", "teacher"] }).notNull().default("teacher"),
    createdAt: ts("created_at").notNull().default(now),
    archivedAt: ts("archived_at"),
  },
  (t) => [uniqueIndex("teachers_email_unique").on(t.email)],
);

/** Optional server-side session records, for revocation beyond JWT expiry. */
export const teacherSessions = sqliteTable(
  "teacher_sessions",
  {
    id: text("id").primaryKey(),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => teachers.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("teacher_sessions_teacher_idx").on(t.teacherId)],
);

// ---------------------------------------------------------------------------
// Batches and students
// ---------------------------------------------------------------------------

export const batches = sqliteTable("batches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  /** Lineage only: copying a batch must never copy its past exams. */
  copiedFromBatchId: text("copied_from_batch_id"),
  createdAt: ts("created_at").notNull().default(now),
  archivedAt: ts("archived_at"),
});

export const students = sqliteTable(
  "students",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    rollNo: text("roll_no").notNull(),
    /** Lowercased, punctuation-stripped. The cross-semester match key. */
    rollNoNormalized: text("roll_no_normalized").notNull(),
    createdAt: ts("created_at").notNull().default(now),
    archivedAt: ts("archived_at"),
  },
  (t) => [uniqueIndex("students_roll_unique").on(t.rollNoNormalized)],
);

export const batchStudents = sqliteTable(
  "batch_students",
  {
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    joinedAt: ts("joined_at").notNull().default(now),
  },
  (t) => [
    primaryKey({ columns: [t.batchId, t.studentId] }),
    index("batch_students_student_idx").on(t.studentId),
  ],
);

// ---------------------------------------------------------------------------
// Question bank: topics -> subtopics -> questions, and reusable modules
// ---------------------------------------------------------------------------

export const topics = sqliteTable(
  "topics",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("topics_parent_idx").on(t.parentId)],
);

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    subtopicId: text("subtopic_id").notNull(),
    type: text("type", {
      enum: ["mcq_single", "mcq_multi", "true_false", "numeric"],
    }).notNull(),
    prompt: text("prompt").notNull(),
    mediaKey: text("media_key"),
    /** JSON array of { id, text }. */
    optionsJson: text("options_json").notNull().default("[]"),
    /** JSON array of option ids / or { number, tolerance }. */
    correctJson: text("correct_json").notNull().default("[]"),
    marks: real("marks").notNull().default(1),
    negativeMarks: real("negative_marks").notNull().default(0),
    explanation: text("explanation"),
    createdAt: ts("created_at").notNull().default(now),
    updatedAt: ts("updated_at").notNull().default(now),
    /** Archived questions still resolve in frozen exam papers; never hard-delete. */
    archivedAt: ts("archived_at"),
  },
  (t) => [index("questions_subtopic_idx").on(t.subtopicId)],
);

export const questionModules = sqliteTable(
  "question_modules",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    parentId: text("parent_id"),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [index("question_modules_parent_idx").on(t.parentId)],
);

export const moduleQuestions = sqliteTable(
  "module_questions",
  {
    moduleId: text("module_id")
      .notNull()
      .references(() => questionModules.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.moduleId, t.questionId] })],
);

// ---------------------------------------------------------------------------
// Exams (fixed wall-clock close) + frozen paper
// ---------------------------------------------------------------------------

export const exams = sqliteTable(
  "exams",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status", { enum: ["draft", "published", "closed"] })
      .notNull()
      .default("draft"),
    /** Hard window. `deadline = min(ends_at, started_at + duration)`. */
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    joinCode: text("join_code").notNull(),
    shuffleQuestions: integer("shuffle_questions", { mode: "boolean" }).notNull().default(false),
    shuffleOptions: integer("shuffle_options", { mode: "boolean" }).notNull().default(false),
    lockToDevice: integer("lock_to_device", { mode: "boolean" }).notNull().default(true),
    createdAt: ts("created_at").notNull().default(now),
    publishedAt: ts("published_at"),
    closedAt: ts("closed_at"),
  },
  (t) => [
    uniqueIndex("exams_join_code_unique").on(t.joinCode),
    index("exams_batch_idx").on(t.batchId),
  ],
);

/** Publish-time snapshot. The exam is immutable once it has been given. */
export const examPaperItems = sqliteTable(
  "exam_paper_items",
  {
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    questionId: text("question_id").notNull(),
    /** Full question content as it was at publish time. */
    snapshotJson: text("snapshot_json").notNull(),
    marks: real("marks").notNull(),
  },
  (t) => [primaryKey({ columns: [t.examId, t.position] })],
);

// ---------------------------------------------------------------------------
// Attempts, answers, violations
// ---------------------------------------------------------------------------

export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    examId: text("exam_id")
      .notNull()
      .references(() => exams.id, { onDelete: "cascade" }),
    batchId: text("batch_id").notNull(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["in_progress", "submitted", "timed_out", "abandoned", "flagged", "banned"],
    })
      .notNull()
      .default("in_progress"),
    startedAt: ts("started_at").notNull().default(now),
    /** Stamped server-side: min(exam.ends_at, started_at + duration). */
    deadlineAt: ts("deadline_at").notNull(),
    submittedAt: ts("submitted_at"),
    deviceToken: text("device_token"),
    questionOrderJson: text("question_order_json").notNull().default("[]"),
    score: real("score"),
    maxScore: real("max_score"),
    violationCount: integer("violation_count").notNull().default(0),
    createdAt: ts("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("attempts_exam_student_unique").on(t.examId, t.studentId),
    index("attempts_exam_idx").on(t.examId),
    index("attempts_student_idx").on(t.studentId),
  ],
);

export const answers = sqliteTable(
  "answers",
  {
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    selectedJson: text("selected_json").notNull().default("[]"),
    /** Typed answer for numeric questions. */
    numericValue: real("numeric_value"),
    answeredAt: ts("answered_at").notNull().default(now),
    isCorrect: integer("is_correct", { mode: "boolean" }),
    awardedMarks: real("awarded_marks"),
  },
  (t) => [primaryKey({ columns: [t.attemptId, t.questionId] })],
);

/** Recorded for teacher review. Never auto-bans on its own. */
export const violations = sqliteTable(
  "violations",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: [
        "visibility_hidden",
        "window_blur",
        "fullscreen_exit",
        "copy",
        "paste",
        "heartbeat_missed",
        "clock_skew",
        "devtools_suspected",
      ],
    }).notNull(),
    occurredAt: ts("occurred_at").notNull(),
    receivedAt: ts("received_at").notNull().default(now),
    detail: text("detail"),
  },
  (t) => [index("violations_attempt_idx").on(t.attemptId)],
);
