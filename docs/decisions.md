# Decisions

Resolved during the pre-build review. Each entry is a decision that changes the
schema or the Worker topology, with the reasoning so we don't relitigate it.

## D1 — Backend primitives

**D1 + Durable Objects + R2 + KV.** D1 for relational data, a DO per exam for
authoritative timing/anti-cheat/live monitoring, R2 for question media, KV for
join-code lookup and rate limiting.

## D2 — Timing model

**Fixed wall-clock close.** The exam has a hard `endsAt`; every attempt must
finish by then, so late joiners get less time. Per-attempt cap is
`durationMinutes`. `deadline = min(endsAt, start + duration)`.

## D3 — Student identity

**A person continues across batches.** Identity is the normalized roll number.
Copying a batch for a new semester keeps the same students, so a report card can
span semesters. Batches are time slices joined through `batch_students`.

## D4 — Anti-cheat

**Heartbeat + event log + teacher review.** No auto-ban. Web violation signals
are too noisy (incoming calls, notifications) to punish automatically. The
teacher gets a timeline and decides.

## D5 — Teacher auth

**In-app email/password**, implemented in the Worker (PBKDF2 + HS256 JWT
cookie). No external identity provider.

## D6 — Student PWA hosting

**Vercel** (with Cloudflare handling API, DO, DB, storage).

## D7 — Question types (locked)

**mcq_single** (four options, one answer), **mcq_multi** (four options, one or
more answers), **true_false** (one statement, two buttons), **numeric** (a
number, optional tolerance). All four are auto-gradable, so v1 has **no manual
grading workflow**. Subjective/handwritten was explicitly excluded — students do
rough work on paper and only submit answers on the phone.

## D8 — Exam paper snapshot

**Freeze on publish.** `exam_paper_items` stores the question content as it was.
Editing the bank later never changes past exams or report cards.

## D9 — Cloudflare namespacing
Every resource is prefixed `kap-exam-` (`kap-exam-db`, `kap-exam-materials`,
`kap-exam-api`). This project must never touch the separately deployed
`kap-api` / `kap-materials` resources.

## D10 — Next.js can't reach D1 directly

Next on Vercel has no Cloudflare bindings, so the admin app talks to the Worker
over HTTP with credentials. The Worker is the only writer to D1.

## D11 — Question media (diagrams/images)

Teacher uploads an image for a question; it is stored in R2 (`MATERIALS_BUCKET`)
under an unguessable key. The question row keeps only `mediaKey`. Students fetch
it via `GET /api/media/:key` while taking the exam, so the image travels with the
frozen paper snapshot and needs no student session. Short cache TTL, and the PWA
service worker never caches API traffic.

## D12 — Theme: warm, system-only

The palette is warm (cream/espresso light, warm charcoal dark) with a terracotta
`--primary`. Light/dark is selected **only** by `prefers-color-scheme` — there is
no toggle and no stored preference. Enforced with a media-based Tailwind variant
(`@custom-variant dark (@media (prefers-color-scheme: dark))`) and a CSS-only
`Logo` swap (colored mark on light, white mark on dark), so nothing depends on JS
and there is no flash on load.

## D13 — Topics are the pools; no modules

The "module" collection was removed (schema, API, UI). Exams draw straight
from topics/subtopics: take N random or hand-pick. One less concept for the
teacher to maintain; the bank stays the single source of questions.

## D14 — Roster-first, roll-only join

Teacher enters name+roll once per batch. Students join with roll number only;
the name resolves from the roster. Unknown rolls and rolls outside the exam's
batch are rejected with a plain-language message. Rejoin after submit returns
the scored result instead of a raw error.

## D15 — AI question-set generation (server-only)

`POST /api/ai/generate-questions` is a Next.js Route Handler (App Router).
The Gemini key lives in `process.env` there and never reaches the browser; the
caller proves teacherhood with their Worker bearer token, verified against
`/api/auth/me`. Structured JSON output is validated item-by-item with the same
Zod schemas as hand-written questions; invalid drafts are dropped with warnings.
Nothing is saved until the teacher approves the set in the review UI. Default
10, teacher intent in the prompt outranks all defaults. Model and key are env
(`GEMINI_MODEL`, `GEMINI_API_KEY`); free-tier quotas (15 rpm) are respected by
design (one call per generation, max 20 questions).

## D16 — Tests

Vitest unit tests for grading/identity/timing (`apps/api/test`), plus
`apps/api/scripts/e2e.mjs` — a 26-assertion full-loop regression against local
D1 (run with `pnpm --filter @kap-exam/api test:e2e` while `wrangler dev` runs).
Browser flows are covered by the agent-browser pass documented in chat, not yet
by an automated runner.

## Open / deferred

- Print stylesheets for reports (whole-page `window.print()` for now).
- Realtime teacher monitor UI (DO WebSocket) — the DO stores state; the socket
  transport is next.
- Rate limiting on student join (`KV` is bound, policy not written).
