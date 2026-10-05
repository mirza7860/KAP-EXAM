import { schema } from "@kap-exam/db";
import type { Question } from "@kap-exam/shared";
import { inArray } from "drizzle-orm";
import type { AppBindings } from "../env.js";

/**
 * Attempt scoring, shared by the report routes and the classroom leaderboard
 * so a projected rank and a printed report card can never disagree.
 *
 * Scoring is bulk: the frozen paper is read once per exam and every saved
 * answer in one query, then graded in memory. The old shape — reload the
 * paper and the answers once *per attempt* — was 1 + 2N round trips for an
 * N-student roster, which is exactly what made a 50-seat report crawl.
 */
export type Db = AppBindings["Variables"]["db"];

export interface Score {
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unattempted: number;
}

export type AnswerRow = typeof schema.answers.$inferSelect;

/** Grade one attempt from its frozen paper and saved answers. */
export function scoreAttempt(paper: Question[], answers: AnswerRow[]): Score {
  const byQ = new Map(answers.map((a) => [a.questionId, a]));
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  let maxScore = 0;

  for (const q of paper) {
    maxScore += q.marks;
    const ans = byQ.get(q.id);
    if (!ans) {
      unattempted++;
      continue;
    }
    if (ans.isCorrect === null || ans.isCorrect === undefined) {
      // No stored verdict yet: fall back to "did they actually answer?".
      let sel: string[] = [];
      try {
        sel = JSON.parse(ans.selectedJson as string) as string[];
      } catch {
        sel = [];
      }
      const hasAns = sel.length > 0 || (ans.numericValue !== null && ans.numericValue !== undefined);
      if (!hasAns) {
        unattempted++;
        continue;
      }
    }
    score += ans.awardedMarks ?? 0;
    if (ans.isCorrect === null) unattempted++;
    else if (ans.isCorrect) correct++;
    else wrong++;
  }

  return { score, maxScore, correct, wrong, unattempted };
}

/**
 * Grade a whole cohort in two extra queries regardless of cohort size:
 * one for every paper item, one for every answer row.
 */
export async function scoreAttempts(
  db: Db,
  attempts: { id: string; examId: string }[],
): Promise<Map<string, Score>> {
  const out = new Map<string, Score>();
  if (attempts.length === 0) return out;

  const examIds = [...new Set(attempts.map((a) => a.examId))];
  const paperRows = await db
    .select()
    .from(schema.examPaperItems)
    .where(inArray(schema.examPaperItems.examId, examIds));
  const paperByExam = new Map<string, Question[]>();
  for (const row of paperRows) {
    const list = paperByExam.get(row.examId) ?? [];
    list.push(JSON.parse(row.snapshotJson) as Question);
    paperByExam.set(row.examId, list);
  }

  const answerRows = await db
    .select()
    .from(schema.answers)
    .where(inArray(schema.answers.attemptId, attempts.map((a) => a.id)));
  const answersByAttempt = new Map<string, AnswerRow[]>();
  for (const row of answerRows) {
    const list = answersByAttempt.get(row.attemptId) ?? [];
    list.push(row);
    answersByAttempt.set(row.attemptId, list);
  }

  for (const attempt of attempts) {
    out.set(
      attempt.id,
      scoreAttempt(paperByExam.get(attempt.examId) ?? [], answersByAttempt.get(attempt.id) ?? []),
    );
  }
  return out;
}
