/**
 * Shared domain vocabulary for KAP EXAM.
 *
 * These are the words the whole system agrees on. Keep them here so the admin
 * app, the student PWA, and the Worker never drift apart.
 */

/** How a question is answered and graded. */
export const QUESTION_TYPES = ["mcq_single", "mcq_multi", "true_false", "numeric"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** Every v1 type is graded without a human. */
export const AUTO_GRADED_TYPES: readonly QuestionType[] = [
  "mcq_single",
  "mcq_multi",
  "true_false",
  "numeric",
];

export function isAutoGraded(type: QuestionType): boolean {
  return AUTO_GRADED_TYPES.includes(type);
}

/** Lifecycle of an exam template. */
export const EXAM_STATUSES = ["draft", "published", "closed"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

/**
 * Lifecycle of one student's attempt.
 *
 * `flagged` and `banned` are review/anti-cheat states, never auto-applied:
 * violations are logged and surfaced to the teacher (see `ViolationType`).
 */
export const ATTEMPT_STATUSES = [
  "in_progress",
  "submitted",
  "timed_out",
  "abandoned",
  "flagged",
  "banned",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/** Signals we record during an attempt. None of these auto-ban on their own. */
export const VIOLATION_TYPES = [
  "visibility_hidden",
  "window_blur",
  "fullscreen_exit",
  "copy",
  "paste",
  "heartbeat_missed",
  "clock_skew",
  "devtools_suspected",
] as const;
export type ViolationType = (typeof VIOLATION_TYPES)[number];

/** Severity is a hint for the review UI, not an enforcement rule. */
export const VIOLATION_SEVERITY: Record<ViolationType, "low" | "medium" | "high"> = {
  visibility_hidden: "low",
  window_blur: "low",
  fullscreen_exit: "medium",
  copy: "medium",
  paste: "medium",
  heartbeat_missed: "medium",
  clock_skew: "high",
  devtools_suspected: "high",
};

export const TEACHER_ROLES = ["owner", "teacher"] as const;
export type TeacherRole = (typeof TEACHER_ROLES)[number];

export const STUDENT_JOIN_STATES = ["joining", "active", "submitted", "locked"] as const;
export type StudentJoinState = (typeof STUDENT_JOIN_STATES)[number];
