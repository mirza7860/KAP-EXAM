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

## Open / deferred

- Randomization per student (shuffle questions/options) is in the schema but not
  yet wired into `exam_paper_items` rendering.
- Realtime teacher monitor UI (DO WebSocket) — the DO stores state; the socket
  transport is next.
- Print stylesheets for reports.
- Rate limiting on student join (`KV` is bound, policy not written).
