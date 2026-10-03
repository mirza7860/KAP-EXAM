import type { QuestionType } from "@kap-exam/shared";

/** Human labels for the four question types. */
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq_single: "Multiple choice — one answer",
  mcq_multi: "Multiple choice — many answers",
  true_false: "True / False",
  numeric: "Numerical",
};

/** Four blank options for an MCQ, with stable ids so marking works before typing. */
export function emptyMcqOptions(): { id: string; text: string }[] {
  return ["a", "b", "c", "d"].map((id) => ({ id, text: "" }));
}
