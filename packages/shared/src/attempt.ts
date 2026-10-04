import { z } from "zod";
import { ATTEMPT_STATUSES, VIOLATION_TYPES } from "./constants";

/** One student's run at one exam. Server-authoritative; the PWA is a view. */

export const attemptSchema = z.object({
  id: z.string().min(1),
  examId: z.string().min(1),
  batchId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(ATTEMPT_STATUSES),
  startedAt: z.coerce.date(),
  /** min(exam.endsAt, startedAt + duration), stamped by the server. */
  deadlineAt: z.coerce.date(),
  submittedAt: z.coerce.date().nullable().default(null),
  /** Opaque token binding this attempt to one browser/device. */
  deviceToken: z.string().min(1).nullable().default(null),
  /** Per-student question order for shuffling. */
  questionOrder: z.array(z.string().min(1)).default([]),
  score: z.number().nullable().default(null),
  maxScore: z.number().nullable().default(null),
});

export type Attempt = z.infer<typeof attemptSchema>;

/** A student joins by opening the link and giving roll no only. Name comes from roster. */
export const joinAttemptSchema = z.object({
  joinCode: z.string().trim().min(4).max(32),
  rollNo: z.string().trim().min(1).max(32),
  /** Optional for backwards compat; ignored when roster match is found. */
  name: z.string().trim().min(1).max(80).optional(),
  /** Browser-generated; lets a reload resume the same attempt. */
  deviceToken: z.string().min(8).max(128),
});

export type JoinAttemptInput = z.infer<typeof joinAttemptSchema>;

export const answerSchema = z.object({
  questionId: z.string().min(1),
  /** Option ids for mcq / multi-select / true-false. */
  selectedOptionIds: z.array(z.string()).default([]),
  /** The typed number for numeric questions. */
  numericValue: z.number().nullable().default(null),
  answeredAt: z.coerce.date(),
});

export type Answer = z.infer<typeof answerSchema>;

/** Violations are recorded for teacher review. They never auto-ban by themselves. */
export const violationSchema = z.object({
  id: z.string().min(1),
  attemptId: z.string().min(1),
  type: z.enum(VIOLATION_TYPES),
  occurredAt: z.coerce.date(),
  /** Server-received time; the trusted clock. */
  receivedAt: z.coerce.date(),
  detail: z.string().max(2000).nullable().default(null),
});

export type Violation = z.infer<typeof violationSchema>;

export const heartbeatSchema = z.object({
  attemptId: z.string().min(1),
  /** Client clock, used only to detect skew against the server clock. */
  clientNow: z.coerce.number().int(),
  answeredCount: z.number().int().min(0),
});

export type HeartbeatInput = z.infer<typeof heartbeatSchema>;

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export const attemptResultSchema = z.object({
  attemptId: z.string().min(1),
  studentId: z.string().min(1),
  studentName: z.string(),
  rollNo: z.string(),
  status: z.enum(ATTEMPT_STATUSES),
  score: z.number(),
  maxScore: z.number(),
  correct: z.number().int().min(0),
  wrong: z.number().int().min(0),
  unattempted: z.number().int().min(0),
  /** Sum of severity hints, for sorting the review queue. */
  violationCount: z.number().int().min(0),
});

export type AttemptResult = z.infer<typeof attemptResultSchema>;

/** One exam's roster, rendered ascending by roll no for printing. */
export const examReportSchema = z.object({
  examId: z.string().min(1),
  examTitle: z.string(),
  batchName: z.string(),
  closedAt: z.coerce.date(),
  maxScore: z.number(),
  results: z.array(attemptResultSchema),
});

export type ExamReport = z.infer<typeof examReportSchema>;

/** A student's cumulative history across batches. */
export const studentReportSchema = z.object({
  studentId: z.string().min(1),
  name: z.string(),
  rollNo: z.string(),
  examsTaken: z.number().int().min(0),
  examsMissed: z.number().int().min(0),
  totals: z.object({
    score: z.number(),
    maxScore: z.number(),
    correct: z.number().int().min(0),
    wrong: z.number().int().min(0),
    unattempted: z.number().int().min(0),
  }),
  history: z.array(attemptResultSchema.extend({ examTitle: z.string(), takenAt: z.coerce.date() })),
});

export type StudentReport = z.infer<typeof studentReportSchema>;
