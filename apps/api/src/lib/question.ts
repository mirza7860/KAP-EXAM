import type { schema } from "@kap-exam/db";
import type { Question, QuestionInput } from "@kap-exam/shared";

/**
 * Mapping between the domain `Question` and its D1 row.
 *
 * The row stores options and the correct answer as JSON so all four types share
 * one table. `correctJson` has a single shape regardless of type, which keeps
 * grading simple: choices read `optionIds`, numeric reads `number`/`tolerance`.
 */

export type QuestionRow = typeof schema.questions.$inferSelect;

interface CorrectPayload {
  optionIds: string[];
  number: number | null;
  tolerance: number | null;
}

const EMPTY_CORRECT: CorrectPayload = { optionIds: [], number: null, tolerance: null };

export function serializeQuestion(input: QuestionInput): {
  optionsJson: string;
  correctJson: string;
} {
  const isNumeric = input.type === "numeric";
  const correct: CorrectPayload = {
    optionIds: isNumeric ? [] : input.correctOptionIds,
    number: isNumeric ? input.correctNumber : null,
    tolerance: isNumeric ? input.numericTolerance : null,
  };
  return {
    optionsJson: JSON.stringify(input.options),
    correctJson: JSON.stringify(correct),
  };
}

export function deserializeQuestion(row: QuestionRow): Question {
  let options: Question["options"] = [];
  let correct = EMPTY_CORRECT;
  try {
    options = JSON.parse(row.optionsJson) as Question["options"];
  } catch {
    options = [];
  }
  try {
    correct = { ...EMPTY_CORRECT, ...(JSON.parse(row.correctJson) as CorrectPayload) };
  } catch {
    correct = EMPTY_CORRECT;
  }

  return {
    id: row.id,
    subtopicId: row.subtopicId,
    type: row.type,
    prompt: row.prompt,
    mediaKey: row.mediaKey,
    options,
    correctOptionIds: correct.optionIds ?? [],
    correctNumber: correct.number ?? null,
    numericTolerance: correct.tolerance ?? null,
    marks: row.marks,
    negativeMarks: row.negativeMarks,
    explanation: row.explanation,
    archivedAt: row.archivedAt,
  };
}
