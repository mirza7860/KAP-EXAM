import { z } from "zod";

/**
 * Shared HTTP contract between the admin app, the student PWA, and the Worker.
 * The Worker is the only writer; both frontends consume these envelopes.
 */

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
    /** Field-level issues when the failure is validation, keyed by path. */
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiErrorCodes = {
  badRequest: "bad_request",
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  notFound: "not_found",
  conflict: "conflict",
  windowClosed: "window_closed",
  attemptLocked: "attempt_locked",
  alreadySubmitted: "already_submitted",
  rateLimited: "rate_limited",
  internal: "internal",
} as const;

export type ApiErrorCode = (typeof apiErrorCodes)[keyof typeof apiErrorCodes];

/** Wraps a payload schema into a success envelope: `{ data: T }`. */
export function ok<T extends z.ZodTypeAny>(data: T) {
  return z.object({ data });
}
