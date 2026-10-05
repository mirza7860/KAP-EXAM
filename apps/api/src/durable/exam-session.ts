import type { Env } from "../env.js";

/**
 * ExamSession — one Durable Object per exam.
 *
 * This is the TRUST BOUNDARY. The student's browser is untrusted, so the
 * authoritative clock, attempt state and violation log all live here:
 *   - `deadlineAt = min(exam.endsAt, startedAt + durationMinutes)` is stamped here.
 *   - The alarm auto-closes attempts at the wall-clock end (fixed-close model).
 *   - Violations are RECORDED, never auto-ban (review-first policy).
 *
 * The Worker forwards to this DO by exam id:
 *   env.EXAM_SESSION.get(env.EXAM_SESSION.idFromName(examId))
 */

interface ExamConfig {
  examId: string;
  /** Wall-clock close, ms epoch. */
  endsAt: number;
  durationMinutes: number;
  heartbeatGraceSeconds: number;
}

interface Participant {
  attemptId: string;
  studentId: string;
  name: string;
  rollNo: string;
  startedAt: number;
  deadlineAt: number;
  lastSeenAt: number;
  answeredCount: number;
  /**
   * Distinct question ids the student has answered. The count above is derived
   * from this: an answer is re-sent on every edit (the numeric box saves on
   * each keystroke), so counting events rather than questions reported 11 for
   * a 10-question paper. Optional because attempts that started before this
   * was tracked have no set.
   */
  answeredQuestionIds?: string[];
  status: "in_progress" | "submitted" | "timed_out";
}

interface ViolationRecord {
  attemptId: string;
  type: string;
  occurredAt: number;
  receivedAt: number;
  detail: string | null;
}

const CONFIG_KEY = "config";
const PARTICIPANTS_KEY = "participants";
const VIOLATIONS_KEY = "violations";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export class ExamSession implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  private async config(): Promise<ExamConfig | undefined> {
    return this.state.storage.get<ExamConfig>(CONFIG_KEY);
  }

  private async participants(): Promise<Map<string, Participant>> {
    return (await this.state.storage.get<Map<string, Participant>>(PARTICIPANTS_KEY)) ?? new Map();
  }

  private async saveParticipants(map: Map<string, Participant>): Promise<void> {
    await this.state.storage.put(PARTICIPANTS_KEY, map);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const route = `${request.method} ${url.pathname}`;

    switch (route) {
      case "POST /init":
        return this.handleInit(request);
      case "POST /join":
        return this.handleJoin(request);
      case "POST /heartbeat":
        return this.handleHeartbeat(request);
      case "POST /answer":
        return this.handleAnswer(request);
      case "POST /submit":
        return this.handleSubmit(request);
      case "POST /violation":
        return this.handleViolation(request);
      case "POST /close":
        return this.handleClose();
      case "GET /state":
        return this.handleState();
      default:
        return json({ error: { code: "not_found", message: `Unknown route ${route}` } }, 404);
    }
  }

  /** Idempotent: safe to call on every student join. */
  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json()) as Omit<ExamConfig, "heartbeatGraceSeconds">;
    const existing = await this.config();
    if (!existing) {
      const config: ExamConfig = {
        ...body,
        heartbeatGraceSeconds: Number(this.env.HEARTBEAT_GRACE_SECONDS) || 45,
      };
      await this.state.storage.put(CONFIG_KEY, config);
      await this.state.storage.setAlarm(config.endsAt);
    }
    return json({ ok: true });
  }

  private async handleJoin(request: Request): Promise<Response> {
    const body = (await request.json()) as Pick<
      Participant,
      "attemptId" | "studentId" | "name" | "rollNo"
    >;
    const config = await this.config();
    if (!config) return json({ error: { code: "not_found", message: "Exam not initialised" } }, 409);

    const now = Date.now();
    if (now >= config.endsAt) {
      return json({ error: { code: "window_closed", message: "Exam window has closed" } }, 410);
    }

    const participants = await this.participants();
    const existing = participants.get(body.attemptId);
    if (existing) {
      existing.lastSeenAt = now;
      await this.saveParticipants(participants);
      return json({ participant: existing, serverNow: now });
    }

    // Server stamps the deadline. The client never supplies it.
    const deadlineAt = Math.min(now + config.durationMinutes * 60_000, config.endsAt);
    const participant: Participant = {
      ...body,
      startedAt: now,
      deadlineAt,
      lastSeenAt: now,
      answeredCount: 0,
      answeredQuestionIds: [],
      status: "in_progress",
    };
    participants.set(participant.attemptId, participant);
    await this.saveParticipants(participants);
    return json({ participant, serverNow: now });
  }

  private async handleHeartbeat(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      attemptId: string;
      clientNow: number;
      answeredCount: number;
    };
    const now = Date.now();
    const participants = await this.participants();
    const participant = participants.get(body.attemptId);
    if (!participant) return json({ error: { code: "not_found", message: "Unknown attempt" } }, 404);

    participant.lastSeenAt = now;
    // The server owns the count via answeredQuestionIds. Only fall back to the
    // client's number for an attempt that predates that tracking - otherwise
    // the two writers disagree and the count can jump backwards.
    if (!participant.answeredQuestionIds) participant.answeredCount = body.answeredCount;
    await this.saveParticipants(participants);

    // Clock skew is a signal, not an offence: record it for the teacher.
    if (Math.abs(body.clientNow - now) > 60_000) {
      await this.recordViolation({
        attemptId: body.attemptId,
        type: "clock_skew",
        occurredAt: body.clientNow,
        receivedAt: now,
        detail: `skew_ms=${body.clientNow - now}`,
      });
    }

    const expired = now >= participant.deadlineAt;
    return json({ serverNow: now, deadlineAt: participant.deadlineAt, expired, status: participant.status });
  }

  private async handleAnswer(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      attemptId: string;
      questionId: string;
      selectedOptionIds: string[];
      numericValue: number | null;
    };
    const now = Date.now();
    const participants = await this.participants();
    const participant = participants.get(body.attemptId);
    if (!participant) return json({ error: { code: "not_found", message: "Unknown attempt" } }, 404);
    if (participant.status !== "in_progress") {
      return json({ error: { code: "already_submitted", message: "Attempt already closed" } }, 409);
    }
    // Authoritative cutoff: late answers are rejected here, not in the browser.
    if (now > participant.deadlineAt) {
      return json({ error: { code: "window_closed", message: "Time is up" } }, 410);
    }

    // TODO: persist the answer to D1 `answers` and grade auto-gradable types.
    participant.lastSeenAt = now;
    // Count questions, not answer events: editing an answer (or typing a
    // multi-digit number) re-sends it, and a cleared answer stops counting.
    const answered = new Set(participant.answeredQuestionIds ?? []);
    const blank = body.selectedOptionIds.length === 0 && body.numericValue === null;
    if (blank) answered.delete(body.questionId);
    else answered.add(body.questionId);
    participant.answeredQuestionIds = [...answered];
    participant.answeredCount = answered.size;
    await this.saveParticipants(participants);
    return json({ ok: true, serverNow: now });
  }

  private async handleSubmit(request: Request): Promise<Response> {
    const body = (await request.json()) as { attemptId: string };
    const participants = await this.participants();
    const participant = participants.get(body.attemptId);
    if (!participant) return json({ error: { code: "not_found", message: "Unknown attempt" } }, 404);
    if (participant.status === "in_progress") {
      participant.status = "submitted";
      await this.saveParticipants(participants);
      // TODO: finalise scoring + write the report row to D1.
    }
    return json({ participant, serverNow: Date.now() });
  }

  private async handleViolation(request: Request): Promise<Response> {
    const body = (await request.json()) as ViolationRecord;
    await this.recordViolation({ ...body, receivedAt: Date.now() });
    return json({ ok: true });
  }

  private async recordViolation(record: ViolationRecord): Promise<void> {
    const list = (await this.state.storage.get<ViolationRecord[]>(VIOLATIONS_KEY)) ?? [];
    list.push(record);
    await this.state.storage.put(VIOLATIONS_KEY, list);
    // TODO: mirror into D1 `violations` and bump attempts.violation_count.
  }

  /** Teacher closed the exam early: end it now and time out anyone still working. */
  private async handleClose(): Promise<Response> {
    const config = await this.config();
    const participants = await this.participants();
    const now = Date.now();
    for (const participant of participants.values()) {
      if (participant.status === "in_progress") participant.status = "timed_out";
    }
    await this.saveParticipants(participants);
    if (config) {
      config.endsAt = Math.min(config.endsAt, now);
      await this.state.storage.put(CONFIG_KEY, config);
    }
    return json({ ok: true, serverNow: now });
  }

  private async handleState(): Promise<Response> {
    const config = await this.config();
    const participants = await this.participants();
    const violations = (await this.state.storage.get<ViolationRecord[]>(VIOLATIONS_KEY)) ?? [];
    return json({
      config,
      serverNow: Date.now(),
      participants: [...participants.values()],
      violations,
    });
  }

  /**
   * Alarm = the wall-clock close. Everyone still running is timed out with
   * their unanswered questions counted as unattempted.
   */
  async alarm(): Promise<void> {
    const participants = await this.participants();
    const now = Date.now();
    for (const participant of participants.values()) {
      if (participant.status === "in_progress") {
        participant.status = "timed_out";
      }
    }
    await this.saveParticipants(participants);
    const config = await this.config();
    if (config && now < config.endsAt) {
      await this.state.storage.setAlarm(config.endsAt);
    }
  }
}
