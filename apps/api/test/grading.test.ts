import { describe, expect, it } from "vitest";
import { gradeQuestion, sanitizeForStudent } from "../src/lib/grading.js";
import type { Question } from "@kap-exam/shared";

function mcq(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    subtopicId: "s1",
    type: "mcq_single",
    prompt: "2 + 2?",
    mediaKey: null,
    options: [
      { id: "a", text: "3" },
      { id: "b", text: "4" },
      { id: "c", text: "5" },
      { id: "d", text: "6" },
    ],
    correctOptionIds: ["b"],
    correctNumber: null,
    numericTolerance: null,
    marks: 2,
    negativeMarks: 0.5,
    explanation: null,
    archivedAt: null,
    ...overrides,
  };
}

describe("gradeQuestion", () => {
  it("grades a correct single-choice with full marks", () => {
    expect(gradeQuestion(mcq(), { selectedOptionIds: ["b"], numericValue: null })).toEqual({
      isCorrect: true,
      awardedMarks: 2,
    });
  });

  it("applies negative marking on a wrong choice", () => {
    expect(gradeQuestion(mcq(), { selectedOptionIds: ["a"], numericValue: null })).toEqual({
      isCorrect: false,
      awardedMarks: -0.5,
    });
  });

  it("treats no selection as unattempted (null, zero)", () => {
    expect(gradeQuestion(mcq(), { selectedOptionIds: [], numericValue: null })).toEqual({
      isCorrect: null,
      awardedMarks: 0,
    });
  });

  it("requires the exact set for multi-select", () => {
    const q = mcq({ type: "mcq_multi", correctOptionIds: ["a", "c"] });
    expect(
      gradeQuestion(q, { selectedOptionIds: ["a", "c"], numericValue: null }).isCorrect,
    ).toBe(true);
    expect(
      gradeQuestion(q, { selectedOptionIds: ["a"], numericValue: null }).isCorrect,
    ).toBe(false);
    expect(
      gradeQuestion(q, { selectedOptionIds: ["a", "b", "c"], numericValue: null }).isCorrect,
    ).toBe(false);
  });

  it("grades numerics within tolerance", () => {
    const q = mcq({ type: "numeric", correctNumber: 9.8, numericTolerance: 0.1 });
    expect(gradeQuestion(q, { selectedOptionIds: [], numericValue: 9.85 }).isCorrect).toBe(true);
    expect(gradeQuestion(q, { selectedOptionIds: [], numericValue: 10 }).isCorrect).toBe(false);
    expect(gradeQuestion(q, { selectedOptionIds: [], numericValue: null }).isCorrect).toBe(null);
  });

  it("grades numerics exactly when tolerance is zero", () => {
    const q = mcq({ type: "numeric", correctNumber: 42, numericTolerance: 0 });
    expect(gradeQuestion(q, { selectedOptionIds: [], numericValue: 42 }).isCorrect).toBe(true);
    expect(gradeQuestion(q, { selectedOptionIds: [], numericValue: 42.001 }).isCorrect).toBe(false);
  });
});

describe("sanitizeForStudent", () => {
  it("strips answers, explanation and keeps display fields", () => {
    const out = sanitizeForStudent(mcq(), false);
    expect(out).not.toHaveProperty("correctOptionIds");
    expect(out).not.toHaveProperty("explanation");
    expect(out.options).toHaveLength(4);
    expect(out.marks).toBe(2);
  });

  it("synthesizes true/false options when the bank stores none", () => {
    const out = sanitizeForStudent(mcq({ type: "true_false", options: [] }), false);
    expect(out.options.map((o) => o.id)).toEqual(["true", "false"]);
  });

  it("shuffles option order when asked", () => {
    const orders = new Set(
      Array.from({ length: 20 }, () =>
        sanitizeForStudent(mcq(), true).options.map((o) => o.id).join(""),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});
