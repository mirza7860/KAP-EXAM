import { z } from "zod";

/**
 * Timing model: FIXED WALL-CLOCK CLOSE.
 *
 * An exam has a hard `endsAt`. Every attempt must be finished by then, so a
 * late joiner gets less time. `durationMinutes` is the per-attempt cap. The
 * effective deadline for an attempt is `min(endsAt, startedAt + duration)`.
 *
 * All of this is computed and enforced on the server (per-exam Durable Object).
 * The client only renders a countdown from the server-provided timestamps.
 */

export const examScheduleSchema = z
  .object({
    /** ISO 8601, absolute instant. */
    startsAt: z.coerce.date(),
    /** ISO 8601, absolute instant. The hard close for the whole exam. */
    endsAt: z.coerce.date(),
    /** Per-attempt cap in minutes. */
    durationMinutes: z.number().int().min(1).max(600),
  })
  .refine((s) => s.endsAt > s.startsAt, {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  })
  .refine((s) => s.durationMinutes <= (s.endsAt.getTime() - s.startsAt.getTime()) / 60_000 + 1, {
    message: "Duration cannot exceed the exam window",
    path: ["durationMinutes"],
  });

export type ExamSchedule = z.infer<typeof examScheduleSchema>;

/**
 * The single source of truth for when an attempt dies.
 * Called on the server; never trust a client-provided value.
 */
export function computeAttemptDeadline(
  schedule: Pick<ExamSchedule, "endsAt" | "durationMinutes">,
  startedAt: Date,
): Date {
  const perAttempt = startedAt.getTime() + schedule.durationMinutes * 60_000;
  return new Date(Math.min(perAttempt, schedule.endsAt.getTime()));
}

export function isWindowOpen(schedule: Pick<ExamSchedule, "startsAt" | "endsAt">, now: Date): boolean {
  return now.getTime() >= schedule.startsAt.getTime() && now.getTime() < schedule.endsAt.getTime();
}

export function msRemaining(deadline: Date, now: Date): number {
  return Math.max(0, deadline.getTime() - now.getTime());
}
