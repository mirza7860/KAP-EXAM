import type {
  Question,
  QuestionInput,
  QuestionModule,
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
const TOKEN_KEY = "kap_exam_token";

/** Absolute URL for a question's uploaded media (R2-backed). */
export function mediaUrl(key: string): string {
  return `${API_URL}/api/media/${key}`;
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
};

export const topicApi = {
  list: (includeArchived = false) => api.get<Topic[]>(`/api/topics?includeArchived=${includeArchived}`),
  create: (input: { name: string; parentId?: string | null; position?: number }) =>
    api.post<Topic>("/api/topics", input),
  update: (id: string, input: Partial<{ name: string; parentId: string | null; position: number }>) =>
    api.patch<Topic>(`/api/topics/${id}`, input),
  archive: (id: string) => api.del<{ id: string; archived: boolean }>(`/api/topics/${id}`),
};

export const questionApi = {
  list: (params: { subtopicId?: string; search?: string; includeArchived?: boolean } = {}) => {
    const query = new URLSearchParams();
    if (params.subtopicId) query.set("subtopicId", params.subtopicId);
    if (params.search) query.set("search", params.search);
    if (params.includeArchived) query.set("includeArchived", "true");
    const suffix = query.toString() ? `?${query}` : "";
    return api.get<Question[]>(`/api/questions${suffix}`);
  },
  create: (input: QuestionInput) => api.post<Question>("/api/questions", input),
  update: (id: string, input: QuestionInput) => api.patch<Question>(`/api/questions/${id}`, input),
  archive: (id: string) => api.del<{ id: string; archived: boolean }>(`/api/questions/${id}`),
};

export interface ModuleSummary extends QuestionModule {
  questionCount: number;
}

export interface ModuleDetail extends ModuleSummary {
  questions: Question[];
}

export const moduleApi = {
  list: () => api.get<ModuleSummary[]>("/api/modules"),
  create: (input: { name: string; description?: string | null }) =>
    api.post<ModuleSummary>("/api/modules", input),
  get: (id: string) => api.get<ModuleDetail>(`/api/modules/${id}`),
  addQuestions: (id: string, questionIds: string[]) =>
    api.post<{ moduleId: string; added: number }>(`/api/modules/${id}/questions`, { questionIds }),
  removeQuestion: (id: string, questionId: string) =>
    api.del<{ ok: boolean }>(`/api/modules/${id}/questions/${questionId}`),
};
