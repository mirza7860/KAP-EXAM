import { z } from "zod";
import { QUESTION_TYPES } from "./constants";

/**
 * Question bank: topics -> subtopics -> questions, with reusable modules.
 *
 * A `module` is a saved, named collection of questions ("like Google Drive").
 * Exams compose from modules and/or individually picked questions. At publish
 * time the exam snapshots its paper, so later edits to a question never rewrite
 * an already-given exam's history.
 */

export const questionOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().min(1).max(2000),
});

export const questionSchema = z
  .object({
    id: z.string().min(1),
    subtopicId: z.string().min(1),
    type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(1).max(10_000),
    /** Optional media (image/diagram) stored in R2. */
    mediaKey: z.string().min(1).nullable().default(null),
    options: z.array(questionOptionSchema).default([]),
    /** Option ids (mcq_multi) or option id (mcq_single/true_false). */
    correctOptionIds: z.array(z.string()).default([]),
    /** Expected answer for numeric questions. */
    correctNumber: z.number().nullable().default(null),
    /** Acceptable absolute tolerance for numeric grading. */
    numericTolerance: z.number().min(0).nullable().default(null),
    marks: z.number().positive().max(1000),
    /** Points deducted for a wrong answer. 0 = no negative marking. */
    negativeMarks: z.number().min(0).max(1000).default(0),
    explanation: z.string().max(10_000).nullable().default(null),
    /** Set when archived so past exams keep resolving; never hard-delete. */
    archivedAt: z.coerce.date().nullable().default(null),
  })
  .superRefine((q, ctx) => {
    // mcq: four options, exactly one right answer.
    if (q.type === "mcq_single") {
      if (q.options.length !== 4) {
        ctx.addIssue({ code: "custom", message: "MCQ needs exactly four options", path: ["options"] });
      }
      if (q.correctOptionIds.length !== 1) {
        ctx.addIssue({ code: "custom", message: "MCQ needs exactly one correct option" });
      }
    }

    // multi-select: four options, one or more right answers.
    if (q.type === "mcq_multi") {
      if (q.options.length !== 4) {
        ctx.addIssue({ code: "custom", message: "Multi-select needs exactly four options", path: ["options"] });
      }
      if (q.correctOptionIds.length < 1) {
        ctx.addIssue({ code: "custom", message: "Multi-select needs at least one correct option" });
      }
    }

    // true/false: one statement, two buttons. Options are implied if omitted.
    if (q.type === "true_false") {
      if (q.options.length !== 0 && q.options.length !== 2) {
        ctx.addIssue({ code: "custom", message: "True/false uses two options (or none)", path: ["options"] });
      }
      if (q.correctOptionIds.length !== 1) {
        ctx.addIssue({ code: "custom", message: "True/false needs exactly one correct answer" });
      }
    }

    // numeric: a number, graded with an optional tolerance.
    if (q.type === "numeric") {
      if (q.correctNumber === null) {
        ctx.addIssue({ code: "custom", message: "Numeric questions need a correct answer" });
      }
      if (q.correctOptionIds.length > 0) {
        ctx.addIssue({ code: "custom", message: "Numeric questions do not use options" });
      }
    }
  });

export type Question = z.infer<typeof questionSchema>;

export const topicSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().min(1).nullable().default(null),
  name: z.string().trim().min(1).max(120),
  position: z.number().int().min(0).default(0),
});

export type Topic = z.infer<typeof topicSchema>;

export const questionModuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).nullable().default(null),
  parentId: z.string().min(1).nullable().default(null),
  /** Ordered question ids in the module. */
  questionIds: z.array(z.string().min(1)).default([]),
});

export type QuestionModule = z.infer<typeof questionModuleSchema>;
