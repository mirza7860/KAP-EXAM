import type { Env } from "../env.js";

/** Resolve the Durable Object that owns an exam's authoritative state. */
export function examSessionStub(env: Env, examId: string): DurableObjectStub {
  return env.EXAM_SESSION.get(env.EXAM_SESSION.idFromName(examId));
}

/** POST a JSON body to a Durable Object route and return its JSON response. */
export async function callExamSession<T>(
  env: Env,
  examId: string,
  path: string,
  body: unknown,
): Promise<{ status: number; data: T }> {
  const stub = examSessionStub(env, examId);
  const response = await stub.fetch(`https://exam-session${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as T;
  return { status: response.status, data };
}
