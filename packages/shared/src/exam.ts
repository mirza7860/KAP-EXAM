import { z } from "zod";
import { EXAM_STATUSES } from "./constants";
import { examScheduleSchema } from "./timing";

/** Batch = a semester cohort. Copyable + renamable; past exams stay on the original. */

export const batchSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  /** Optional display note, e.g. "2026 Sem 1". */
  description: z.string().max(500).nullable().default(null),
  /** Batch this one was copied from, if any. Display/lineage only. */
  copiedFromBatchId: z.string().min(1).nullable().default(null),
  archivedAt: z.coerce.date().nullable().default(null),
});

export type Batch = z.infer<typeof batchSchema>;

export function createBatchSchema() {
  return z.object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(500).nullable().optional(),
    copyFromBatchId: z.string().min(1).nullable().optional(),
    /** Copy roster membership but never past exams/reports. */
    copyRoster: z.boolean().default(true),
  });
}

export const updateBatchSchema = createBatchSchema().partial().omit({ copyFromBatchId: true, copyRoster: true });

/** A stable person (across semesters) enrolled into a batch. */
export const studentSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  rollNo: z.string().trim().min(1).max(32),
  /** Normalized roll no used for matching across semesters. */
  rollNoNormalized: z.string().min(1).max(32),
  archivedAt: z.coerce.date().nullable().default(null),
});

export type Student = z.infer<typeof studentSchema>;

/** Which students belong to which batch, and whether they joined an exam. */
export const batchStudentSchema = z.object({
  batchId: z.string().min(1),
  studentId: z.string().min(1),
  joinedAt: z.coerce.date(),
});

export type BatchStudent = z.infer<typeof batchStudentSchema>;

/** A frozen exam paper: snapshot of questions taken at publish time. */
export const examSchema = z.object({
  id: z.string().min(1),
  batchId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  status: z.enum(EXAM_STATUSES),
  schedule: examScheduleSchema,
  /** Short random code that forms the student join link. */
  joinCode: z.string().min(4).max(32),
  /** Whether questions/options are shuffled per student. */
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  /** Whether the attempt locks itself to a single device/session. */
  lockToDevice: z.boolean().default(true),
});

export type Exam = z.infer<typeof examSchema>;

/** Create a draft exam. */
export const examCreateSchema = z.object({
  batchId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  schedule: examScheduleSchema,
  shuffleQuestions: z.boolean().default(false),
  shuffleOptions: z.boolean().default(false),
  lockToDevice: z.boolean().default(true),
});

export type ExamCreateInput = z.infer<typeof examCreateSchema>;

/** Compose a draft exam's paper from modules and/or hand-picked questions. */
export const examComposeSchema = z.object({
  moduleIds: z.array(z.string().min(1)).default([]),
  questionIds: z.array(z.string().min(1)).default([]),
});

export type ExamComposeInput = z.infer<typeof examComposeSchema>;

/** Edit a draft exam. */
export const examUpdateSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  schedule: examScheduleSchema.optional(),
  shuffleQuestions: z.boolean().optional(),
  shuffleOptions: z.boolean().optional(),
  lockToDevice: z.boolean().optional(),
});

/** One question as it appears in a frozen exam paper. */
export const examPaperItemSchema = z.object({
  examId: z.string().min(1),
  position: z.number().int().min(0),
  questionId: z.string().min(1),
  /** Full question content at publish time; history never changes. */
  snapshot: z.unknown(),
  marks: z.number().positive(),
});

export type ExamPaperItem = z.infer<typeof examPaperItemSchema>;
