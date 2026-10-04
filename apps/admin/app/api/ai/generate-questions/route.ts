import { GoogleGenAI } from "@google/genai";
import { questionInputSchema, QUESTION_TYPES } from "@kap-exam/shared";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * POST /api/ai/generate-questions — teacher-only question-set generation.
 *
 * SERVER-ONLY route: the Gemini key lives in `process.env` here and never
 * reaches the browser. The caller must pass their Worker bearer token, which
 * we verify against the Worker's /api/auth/me before spending quota.
 *
 * Flow: describe what you want -> review the drafts -> approve -> they are
 * created as a set in the chosen subtopic. Nothing is saved by this route.
 */

export const maxDuration = 60;

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

const requestSchema = z.object({
  /** Target subtopic for the set (created beforehand by the dialog if new). */
  subtopicId: z.string().min(1),
  /** Teacher's description — the source of truth for topic, level, style. */
  prompt: z.string().trim().min(10).max(2000),
  /** Default 10. Clamped to protect quota and review sanity. */
  count: z.number().int().min(1).max(20).default(10),
  /** Restrict the mix; default is all four types. */
  types: z.array(z.enum(QUESTION_TYPES)).min(1).default([...QUESTION_TYPES]),
  /** Free-form hint, e.g. "Class 10, board-exam difficulty". */
  level: z.string().trim().max(200).nullable().default(null),
});

/** Shape we demand from the model (options as plain texts, answers as indices). */
const aiQuestionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().min(1),
  options: z.array(z.string()).default([]),
  correctIndices: z.array(z.number().int().min(0).max(3)).default([]),
  correctNumber: z.number().nullable().default(null),
  tolerance: z.number().min(0).nullable().default(null),
  marks: z.number().positive().max(100).default(1),
  negativeMarks: z.number().min(0).max(100).default(0),
  explanation: z.string().nullable().default(null),
});

const aiResponseSchema = z.object({ questions: z.array(aiQuestionSchema) });

const OPTION_IDS = ["a", "b", "c", "d"];

function systemPrompt(input: z.infer<typeof requestSchema>): string {
  const typeGuide = input.types
    .map((t) => {
      if (t === "mcq_single") return "- mcq_single: 4 options, EXACTLY ONE correct (correctIndices has 1 entry)";
      if (t === "mcq_multi") return "- mcq_multi: 4 options, 2 or 3 correct (correctIndices has 2-3 entries)";
      if (t === "true_false") return "- true_false: a statement; options must be [] and correctIndices is [0] for true or [1] for false";
      return "- numeric: a problem with a single numeric answer (correctNumber set); tolerance only when the answer is measured/approximate, else 0/null";
    })
    .join("\n");

  return [
    "You are a question setter for an Indian coaching center (Classes 8-12, all subjects).",
    "",
    "The teacher's description below is the SOURCE OF TRUTH. It outranks everything else: topic, class level, difficulty, language, examples, and any type split they mention. If they ask for something specific (e.g. 'only quadratic word problems', '5 easy + 5 hard'), follow it exactly.",
    "",
    `Generate EXACTLY ${input.count} questions, using only these types (mix them unless the teacher says otherwise):`,
    typeGuide,
    "",
    "Rules:",
    "- One concept per question; exam-ready and unambiguous. A student must be able to answer from the prompt alone.",
    "- Vary the numbers, names and scenarios — never repeat the same values across questions.",
    "- mcq options must be plausible (common mistakes as distractors), similar in length, with no giveaway wording.",
    "- Keep explanations to 1-2 lines or null.",
    "- Default marks: 1 for true_false, 2 for others, unless the teacher implies otherwise.",
    "- Use negativeMarks 0 unless the teacher asks for negative marking.",
    "- If the teacher's request is vague or spans multiple topics, pick the most reasonable interpretation and say so in the first question's explanation.",
    "- If the request is not a question-generation request at all, return an empty questions array.",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  // 1. Teacher-only: verify the Worker session behind the bearer token.
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401 },
    );
  }
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
  try {
    const me = await fetch(`${apiUrl}/api/auth/me`, { headers: { authorization: auth } });
    if (!me.ok) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "Session expired" } },
        { status: 401 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: { code: "internal", message: "Could not verify session" } },
      { status: 500 },
    );
  }

  // 2. Validate input.
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Describe what you want (at least 10 characters)" } },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: { code: "internal", message: "AI is not configured on this server" } },
      { status: 503 },
    );
  }

  // 3. Ask Gemini for structured JSON.
  const userText = [
    `Teacher request: ${input.prompt}`,
    input.level ? `Level/context: ${input.level}` : null,
    `Generate exactly ${input.count} questions.`,
  ]
    .filter(Boolean)
    .join("\n");

  let raw: unknown;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 55_000);
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        config: {
          systemInstruction: systemPrompt(input),
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: [...QUESTION_TYPES] },
                    prompt: { type: "string" },
                    options: { type: "array", items: { type: "string" } },
                    correctIndices: { type: "array", items: { type: "integer" } },
                    correctNumber: { type: "number" },
                    tolerance: { type: "number" },
                    marks: { type: "number" },
                    negativeMarks: { type: "number" },
                    explanation: { type: "string" },
                  },
                  required: ["type", "prompt"],
                },
              },
            },
            required: ["questions"],
          },
        },
        contents: [{ role: "user", parts: [{ text: userText }] }],
      });
      raw = JSON.parse(response.text ?? '{"questions":[]}');
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/429|quota|rate/i.test(message)) {
      return NextResponse.json(
        { error: { code: "rate_limited", message: "AI is busy — try again in a minute" } },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: { code: "internal", message: "AI request failed — try again" } },
      { status: 502 },
    );
  }

  // 4. Convert to domain drafts and validate every item. Invalid ones are
  // dropped with a warning — the teacher only ever sees valid questions.
  const shape = aiResponseSchema.safeParse(raw);
  const warnings: string[] = [];
  if (!shape.success) {
    return NextResponse.json(
      { error: { code: "internal", message: "AI gave an unusable answer — try rephrasing" } },
      { status: 502 },
    );
  }

  const drafts: unknown[] = [];
  shape.data.questions.slice(0, input.count).forEach((item, i) => {
    const options = item.options.slice(0, 4).map((text, idx) => ({
      id: OPTION_IDS[idx]!,
      text: text.trim().slice(0, 2000),
    }));
    const correctOptionIds = item.correctIndices
      .filter((idx) => idx < options.length)
      .map((idx) => OPTION_IDS[idx]!);

    const candidate = {
      subtopicId: input.subtopicId,
      type: item.type,
      prompt: item.prompt.trim(),
      mediaKey: null,
      options: item.type === "numeric" ? [] : options,
      correctOptionIds: item.type === "numeric" ? [] : correctOptionIds,
      correctNumber: item.type === "numeric" ? item.correctNumber : null,
      numericTolerance: item.type === "numeric" ? (item.tolerance ?? null) : null,
      marks: item.marks,
      negativeMarks: item.negativeMarks,
      explanation: item.explanation?.trim() ? item.explanation.trim().slice(0, 10_000) : null,
    };
    const valid = questionInputSchema.safeParse(candidate);
    if (valid.success) drafts.push(valid.data);
    else warnings.push(`Question ${i + 1} was dropped (${valid.error.issues[0]?.message ?? "invalid"})`);
  });

  if (drafts.length === 0) {
    return NextResponse.json(
      { error: { code: "internal", message: "AI produced no usable questions — try rephrasing" } },
      { status: 502 },
    );
  }
  if (drafts.length < input.count) {
    warnings.unshift(`Got ${drafts.length} of ${input.count} requested — generate again for more.`);
  }

  return NextResponse.json({ data: { drafts, warnings } });
}
