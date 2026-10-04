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

async function req<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = text ? (JSON.parse(text) as { data?: T; error?: { message?: string } }) : null;
  if (!res.ok) throw new Error(parsed?.error?.message ?? `Request failed (${res.status})`);
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
  submit: (attemptId: string) =>
    req<{ ok: boolean; score: number; maxScore: number; correct: number; wrong: number; unattempted: number }>(
      "/api/attempts/submit",
      { attemptId },
    ),
  violation: (attemptId: string, type: string, detail?: string) =>
    req("/api/attempts/violation", { attemptId, type, occurredAt: Date.now(), detail }).catch(
      () => undefined,
    ),
};

/** Join code from /j/CODE, ?c=CODE, or manual entry. */
export function codeFromLocation(): string {
  const m = window.location.pathname.match(/\/j\/([A-Za-z0-9-]+)/);
  if (m?.[1]) return m[1].toUpperCase();
  const q = new URLSearchParams(window.location.search).get("c");
  if (q) return q.toUpperCase();
  return "";
}
