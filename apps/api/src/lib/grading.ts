import type { Question } from "@kap-exam/shared";

export interface StudentAnswer {
  selectedOptionIds?: string[] | null;
  numericValue?: number | null;
}

export interface GradeResult {
  isCorrect: boolean | null; // null = unattempted
  awardedMarks: number;
}

/**
 * Auto-grading for all four v1 types.
 * - mcq_single / true_false: exact single match
 * - mcq_multi: exact set match (all-or-nothing)
 * - numeric: |answer - correct| <= tolerance (tolerance defaults to 0)
 * Unattempted (no selection and no numeric) => 0, isCorrect null.
 * Wrong choice => negativeMarks applied (can go negative per question? clamp at -negative? we apply -negativeMarks).
 */
export function gradeQuestion(q: Question, a: StudentAnswer): GradeResult {
  const hasSelection = !!a.selectedOptionIds && a.selectedOptionIds.length > 0;
  const hasNumeric = a.numericValue !== null && a.numericValue !== undefined && Number.isFinite(a.numericValue as number);

  if (q.type === "numeric") {
    if (!hasNumeric) return { isCorrect: null, awardedMarks: 0 };
    const tol = q.numericTolerance ?? 0;
    const diff = Math.abs((a.numericValue as number) - (q.correctNumber ?? 0));
    if (diff <= tol + 1e-9) return { isCorrect: true, awardedMarks: q.marks };
    return { isCorrect: false, awardedMarks: -(q.negativeMarks ?? 0) };
  }

  // choice types
  if (!hasSelection) return { isCorrect: null, awardedMarks: 0 };
  const sel = [...(a.selectedOptionIds as string[])].sort();
  const correct = [...(q.correctOptionIds ?? [])].sort();
  const match = sel.length === correct.length && sel.every((v, i) => v === correct[i]);
  if (match) return { isCorrect: true, awardedMarks: q.marks };
  return { isCorrect: false, awardedMarks: -(q.negativeMarks ?? 0) };
}

/** Strip correct answers for student delivery. */
export function sanitizeForStudent(q: Question, shuffleOptions: boolean) {
  let options = q.options.map((o) => ({ id: o.id, text: o.text }));
  if (shuffleOptions && options.length > 1) {
    // Fisher-Yates with Math.random (per-student order; server could seed by attempt but random is fine for v1)
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = options[i]!;
      options[i] = options[j]!;
      options[j] = tmp;
    }
  }
  // true/false with no stored options: synthesize
  if (q.type === "true_false" && options.length === 0) {
    options = [
      { id: "true", text: "True" },
      { id: "false", text: "False" },
    ];
  }
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    mediaKey: q.mediaKey,
    options,
    marks: q.marks,
    negativeMarks: q.negativeMarks,
  };
}
