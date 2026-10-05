const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export interface StudentQuestion {
  id: string;
  type: "mcq_single" | "mcq_multi" | "true_false" | "numeric";
  prompt: string;
  mediaKey: string | null;
  options: { id: string; text: string }[];
  marks: number;
  negativeMarks: number;
}

export interface JoinData {
  attemptId: string;
  student: { name: string; rollNo: string };
  exam: { id: string; title: string; durationMinutes: number; maxScore: number };
  participant: { deadlineAt: number; startedAt: number; status: string };
  serverNow: number;
  paper: StudentQuestion[];
  answers: Record<string, { selectedOptionIds: string[]; numericValue: number | null }>;
}

export class StudentApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(message: string, code: string, status: number, fields?: Record<string, string[]>) {
    super(message);
    this.name = "StudentApiError";
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

async function req<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text
    ? (JSON.parse(text) as { data?: T; error?: { code?: string; message?: string; fields?: Record<string, string[]> } })
    : null;
  if (!res.ok)
    throw new StudentApiError(
      parsed?.error?.message ?? `Request failed (${res.status})`,
      parsed?.error?.code ?? "internal",
      res.status,
      parsed?.error?.fields,
    );
  return (parsed?.data ?? parsed) as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  const text = await res.text();
  const parsed = text
    ? (JSON.parse(text) as { data?: T; error?: { code?: string; message?: string } })
    : null;
  if (!res.ok) throw new StudentApiError(parsed?.error?.message ?? `Request failed (${res.status})`, parsed?.error?.code ?? "internal", res.status);
  return (parsed?.data ?? parsed) as T;
}

export function mediaUrl(key: string): string {
  return `${API_URL}/api/media/${key}`;
}

export function getDeviceToken(): string {
  const KEY = "kap_device_token";
  let t = localStorage.getItem(KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(KEY, t);
  }
  return t;
}

/**
 * One question after the teacher has released the paper: what the student
 * picked, what the answer actually was, and the explanation if the bank has
 * one. `null` until `revealed` — never sent before that.
 */
export interface ReviewItem {
  position: number;
  questionId: string;
  type: StudentQuestion["type"];
  prompt: string;
  mediaKey: string | null;
  marks: number;
  options: { id: string; text: string }[];
  correctOptionIds: string[];
  correctNumber: number | null;
  numericTolerance: number | null;
  explanation: string | null;
  yourSelectedOptionIds: string[];
  yourNumericValue: number | null;
  isCorrect: boolean | null;
  awardedMarks: number;
}

export interface AttemptResult {
  attempt: { id: string; status: string; score: number | null; submittedAt: string | null };
  exam: { id: string; title: string } | null;
  student: { name: string; rollNo: string } | null;
  maxScore: number;
  answeredCount: number;
  /** False while the paper is still with the teacher. */
  revealed: boolean;
  result: { score: number; maxScore: number; correct: number; wrong: number; unattempted: number } | null;
  review: ReviewItem[] | null;
}

export const studentApi = {
  lookup: (joinCode: string, rollNo: string) =>
    req<{ name: string; rollNo: string }>("/api/attempts/lookup", { joinCode, rollNo }),
  join: (joinCode: string, rollNo: string) =>
    req<JoinData>("/api/attempts/join", {
      joinCode,
      rollNo,
      deviceToken: getDeviceToken(),
    }),
  answer: (attemptId: string, questionId: string, selectedOptionIds: string[], numericValue: number | null) =>
    req("/api/attempts/answer", { attemptId, questionId, selectedOptionIds, numericValue }),
  heartbeat: (attemptId: string, answeredCount: number) =>
    req<{ serverNow: number; deadlineAt: number; expired: boolean; status: string }>(
      "/api/attempts/heartbeat",
      { attemptId, clientNow: Date.now(), answeredCount },
    ),
  /** Deliberately returns no score — marks only exist once revealed. */
  submit: (attemptId: string) => req<{ ok: boolean }>("/api/attempts/submit", { attemptId }),
  violation: (attemptId: string, type: string, detail?: string) =>
    req("/api/attempts/violation", { attemptId, type, occurredAt: Date.now(), detail }).catch(
      () => undefined,
    ),
  attempt: (attemptId: string) => get<AttemptResult>(`/api/attempts/${attemptId}`),
};

/** Join code from /j/CODE, ?c=CODE, or manual entry. */
export function codeFromLocation(): string {
  const m = window.location.pathname.match(/\/j\/([A-Za-z0-9-]+)/);
  if (m?.[1]) return m[1].toUpperCase();
  const q = new URLSearchParams(window.location.search).get("c");
  if (q) return q.toUpperCase();
  return "";
}
