import type {
  Paged,
  Question,
  QuestionInput,
  Session,
  Topic,
} from "@kap-exam/shared";

/**
 * Typed client for the Cloudflare Worker API.
 *
 * Auth uses a bearer token (in addition to the Worker's cookie) because the
 * admin app is deployed on Vercel while the API is on Cloudflare — different
 * sites, so `SameSite=Lax` cookies would not survive the cross-site fetch.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
const STUDENT_URL = process.env.NEXT_PUBLIC_STUDENT_URL ?? "http://localhost:5173";
const TOKEN_KEY = "kap_exam_token";

/** Absolute URL for a question's uploaded media (R2-backed). */
export function mediaUrl(key: string): string {
  return `${API_URL}/api/media/${key}`;
}

/** The link a teacher shares for a published exam. */
export function joinUrl(joinCode: string): string {
  return `${STUDENT_URL}/j/${joinCode}`;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let token: string | null = typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY);

export function getToken(): string | null {
  return token;
}

export function setToken(next: string | null): void {
  token = next;
  if (typeof window === "undefined") return;
  if (next) window.localStorage.setItem(TOKEN_KEY, next);
  else window.localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  json?: unknown;
  body?: BodyInit;
  headers?: HeadersInit;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);

  let body = options.body;
  if (options.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(options.json);
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body,
    signal: options.signal,
    credentials: "include",
  });

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const error = (parsed as { error?: { code?: string; message?: string; fields?: Record<string, string[]> } })
      ?.error;
    throw new ApiError(
      error?.code ?? "internal",
      error?.message ?? response.statusText,
      response.status,
      error?.fields,
    );
  }

  return ((parsed as { data?: unknown })?.data ?? parsed) as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, json?: unknown) => request<T>("POST", path, { json }),
  patch: <T>(path: string, json?: unknown) => request<T>("PATCH", path, { json }),
  del: <T>(path: string) => request<T>("DELETE", path),
  upload: async <T>(path: string, file: File): Promise<T> => {
    const form = new FormData();
    form.append("file", file);
    return request<T>("POST", path, { body: form });
  },
};

// ---------------------------------------------------------------------------
// Typed endpoint helpers (thin wrappers over `api`)
// ---------------------------------------------------------------------------

export interface TeacherIdentity extends Session {
  token?: string;
}

export const authApi = {
  signIn: (email: string, password: string) =>
    api.post<TeacherIdentity & { token: string }>("/api/auth/signin", { email, password }),
  signUp: (name: string, email: string, password: string) =>
    api.post<TeacherIdentity & { token: string }>("/api/auth/signup", { name, email, password }),
  me: () => api.get<Session>("/api/auth/me"),
  /** Whether self-registration is still open here. The Worker is the authority. */
  signupStatus: () => api.get<{ open: boolean }>("/api/auth/signup-status"),
};

export const topicApi = {
  list: (includeArchived = false) => api.get<Topic[]>(`/api/topics?includeArchived=${includeArchived}`),
  counts: () =>
    api.get<{ bySubtopic: Record<string, number>; subtree: Record<string, number> }>(
      "/api/topics/counts",
    ),
  create: (input: { name: string; parentId?: string | null; position?: number }) =>
    api.post<Topic>("/api/topics", input),
  update: (id: string, input: Partial<{ name: string; parentId: string | null; position: number }>) =>
    api.patch<Topic>(`/api/topics/${id}`, input),
  /** Deletes the topic, its subtopics and their questions. */
  remove: (id: string) => api.del<{ id: string; topicsDeleted: number }>(`/api/topics/${id}`),
};

export const questionApi = {
  list: (params: {
    subtopicId?: string;
    /** Whole topic subtree — a folder is a pool, not just its first level. */
    topicId?: string;
    search?: string;
    includeArchived?: boolean;
    limit?: number;
    offset?: number;
  } = {}) => {
    const query = new URLSearchParams();
    if (params.subtopicId) query.set("subtopicId", params.subtopicId);
    if (params.topicId) query.set("topicId", params.topicId);
    if (params.search) query.set("search", params.search);
    if (params.includeArchived) query.set("includeArchived", "true");
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    const suffix = query.toString() ? `?${query}` : "";
    return api.get<Paged<Question>>(`/api/questions${suffix}`);
  },
  create: (input: QuestionInput) => api.post<Question>("/api/questions", input),
  update: (id: string, input: QuestionInput) => api.patch<Question>(`/api/questions/${id}`, input),
  remove: (id: string) => api.del<{ id: string; deleted: boolean }>(`/api/questions/${id}`),
};

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

export interface BatchSummary {
  id: string;
  name: string;
  description: string | null;
  copiedFromBatchId: string | null;
  studentCount: number;
}

export interface RosterEntry {
  studentId: string;
  name: string;
  rollNo: string;
  joinedAt: string;
}

export interface BatchDetail extends BatchSummary {
  /** The roster lives on `batchApi.students()` — it is paginated. */
  roster?: RosterEntry[];
}

export const batchApi = {
  list: () => api.get<BatchSummary[]>("/api/batches"),
  create: (input: {
    name: string;
    description?: string | null;
    copyFromBatchId?: string | null;
    copyRoster?: boolean;
  }) => api.post<BatchSummary>("/api/batches", input),
  get: (id: string) => api.get<BatchDetail>(`/api/batches/${id}`),
  /** One page of the roster, ascending by roll no. */
  students: (id: string, params: { limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    const suffix = query.toString() ? `?${query}` : "";
    return api.get<Paged<RosterEntry>>(`/api/batches/${id}/students${suffix}`);
  },
  update: (id: string, input: { name?: string; description?: string | null }) =>
    api.patch<BatchSummary>(`/api/batches/${id}`, input),
  remove: (id: string) => api.del<{ id: string; deleted: boolean }>(`/api/batches/${id}`),
  addStudent: (id: string, input: { name?: string; rollNo?: string; studentId?: string }) =>
    api.post<{ batchId: string; studentId: string }>(`/api/batches/${id}/students`, input),
  removeStudent: (id: string, studentId: string) =>
    api.del<{ ok: boolean }>(`/api/batches/${id}/students/${studentId}`),
};

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export type PaperSourceInput =
  | { kind: "subtopic"; subtopicId: string; count?: number }
  | { kind: "topic"; topicId: string; count?: number }
  | { kind: "questions"; questionIds: string[] };

export interface ExamSummary {
  id: string;
  batchId: string;
  batchName: string;
  title: string;
  status: "draft" | "published" | "closed";
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  joinCode: string;
  questionCount: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  lockToDevice: boolean;
  /** Stamped once, by the teacher, when the answer key is released. One way. */
  revealedAt?: string | null;
}

export interface PaperItem {
  position: number;
  questionId: string;
  marks: number;
  question: Question;
}

export interface ExamDetail extends ExamSummary {
  paper: PaperItem[];
  maxScore: number;
}

export interface ExamLiveState {
  config?: {
    examId: string;
    endsAt: number;
    durationMinutes: number;
    /** Seconds without a heartbeat before a student counts as gone. */
    heartbeatGraceSeconds?: number;
  } | null;
  serverNow: number;
  participants: {
    attemptId: string;
    name: string;
    rollNo: string;
    status: string;
    answeredCount: number;
    deadlineAt: number;
    lastSeenAt: number;
  }[];
  violations: { attemptId: string; type: string; receivedAt: number }[];
}

/** One finished attempt, ranked for the classroom display. */
export interface LeaderboardEntry {
  rank: number;
  attemptId: string;
  studentId: string;
  name: string;
  rollNo: string;
  status: string;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unattempted: number;
  violationCount: number;
}

/** Projected once the teacher reveals: podium + scrollable board. */
export interface Leaderboard {
  examId: string;
  revealedAt: string | null;
  /** Everyone enrolled in the batch, not just those who turned up. */
  cohortSize: number;
  appeared: number;
  maxScore: number;
  entries: LeaderboardEntry[];
}

export const examApi = {
  /** One page of exams, newest first. */
  list: (params: { limit?: number; offset?: number } = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.set("limit", String(params.limit));
    if (params.offset) query.set("offset", String(params.offset));
    const suffix = query.toString() ? `?${query}` : "";
    return api.get<Paged<ExamSummary>>(`/api/exams${suffix}`);
  },
  create: (input: {
    batchId: string;
    title: string;
    schedule: { startsAt: string; endsAt: string; durationMinutes: number };
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
  }) => api.post<ExamSummary>("/api/exams", input),
  get: (id: string) => api.get<ExamDetail>(`/api/exams/${id}`),
  update: (
    id: string,
    input: {
      title?: string;
      schedule?: { startsAt: string; endsAt: string; durationMinutes: number };
      shuffleQuestions?: boolean;
      shuffleOptions?: boolean;
    },
  ) => api.patch<ExamSummary>(`/api/exams/${id}`, input),
  compose: (id: string, input: { sources: PaperSourceInput[] }) =>
    api.post<{ questionCount: number; maxScore: number; paper: PaperItem[] }>(
      `/api/exams/${id}/compose`,
      input,
    ),
  publish: (id: string) => api.post<ExamSummary>(`/api/exams/${id}/publish`, {}),
  close: (id: string) => api.post<ExamSummary>(`/api/exams/${id}/close`, {}),
  /** Release the answer key. Irreversible. */
  reveal: (id: string) => api.post<ExamDetail>(`/api/exams/${id}/reveal`, {}),
  live: (id: string) => api.get<ExamLiveState>(`/api/exams/${id}/live`),
  leaderboard: (id: string) => api.get<Leaderboard>(`/api/exams/${id}/leaderboard`),
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface AttemptResultRow {
  attemptId: string;
  studentId: string;
  studentName: string;
  rollNo: string;
  status: string;
  score: number;
  maxScore: number;
  correct: number;
  wrong: number;
  unattempted: number;
  violationCount: number;
}

export interface ExamReportData {
  examId: string;
  examTitle: string;
  batchName: string;
  closedAt: string;
  maxScore: number;
  /** One page of the cohort — the summary below covers all of it. */
  results: AttemptResultRow[];
  summary?: { totalStudents: number; appeared: number; avgScore: number };
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
}

export interface StudentHistoryRow extends AttemptResultRow {
  examTitle: string;
  takenAt: string;
  batchId?: string;
  batchName?: string;
}

export interface StudentReportData {
  studentId: string;
  name: string;
  rollNo: string;
  examsTaken: number;
  examsMissed: number;
  totals: { score: number; maxScore: number; correct: number; wrong: number; unattempted: number };
  history: StudentHistoryRow[];
  batches: { id: string; name: string }[];
  missedExams?: { id: string; title: string; batchId: string; batchName: string; startsAt: string }[];
  /** Page metadata — `totals` always spans the full history. */
  total?: number;
  limit?: number;
  offset?: number;
  hasMore?: boolean;
}

function pageQuery(params: { limit?: number; offset?: number; batchId?: string } = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", String(params.limit));
  if (params.offset) query.set("offset", String(params.offset));
  if (params.batchId) query.set("batchId", params.batchId);
  return query.toString() ? `?${query}` : "";
}

export const reportApi = {
  exam: (examId: string, params: { limit?: number; offset?: number } = {}) =>
    api.get<ExamReportData>(`/api/reports/exams/${examId}${pageQuery(params)}`),
  student: (
    studentId: string,
    params: { limit?: number; offset?: number; batchId?: string } = {},
  ) => api.get<StudentReportData>(`/api/reports/students/${studentId}${pageQuery(params)}`),
};

// ---------------------------------------------------------------------------
// Overview (dashboard)
// ---------------------------------------------------------------------------

export interface Overview {
  counts: { topics: number; questions: number; batches: number; students: number };
  exams: { draft: number; published: number; closed: number; liveNow: number; upcoming: number };
  recentExams: {
    id: string;
    title: string;
    status: string;
    batchName: string;
    questionCount: number;
    startsAt: string;
    endsAt: string;
    joinCode: string;
  }[];
  focus: {
    id: string;
    title: string;
    batchName: string;
    startsAt: string;
    endsAt: string;
    joinCode: string;
    live: boolean;
    studentCount: number;
  }[];
}

export const overviewApi = { get: () => api.get<Overview>("/api/overview") };
