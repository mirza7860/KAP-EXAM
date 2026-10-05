# Architecture

## Trust model

The student device is untrusted but is also the only place the exam renders.
The resolution:

```
student web app ──HTTP──► Worker (Hono) ──► per-exam Durable Object   ← authoritative
                            │                    │
                            └────► D1 ◄──────────┘   (durable rows + audit)
```

- The **Worker** resolves routing, auth, validation, and D1 reads/writes.
- The **Durable Object** (`ExamSession`, one per exam) owns the clock, the live
  roster, and the violation log. `deadlineAt = min(exam.endsAt, startedAt + duration)`
  is computed there and nowhere else.
- The browser renders a countdown from server timestamps and sends heartbeats.
  It is never the source of truth.

## Why a Durable Object per exam

- A single serialization point for a live, shardable session (an exam is a
  natural room).
- Realtime teacher monitoring (who is online, progress) with no polling.
- An `alarm()` fires exactly at the wall-clock close to time out stragglers.

## Timing: fixed wall-clock close

- The exam has `startsAt` / `endsAt`. Everyone must finish by `endsAt`.
- Each attempt also has a per-attempt cap, so `deadline = min(endsAt, start + duration)`.
- A student who joins late gets less time, matching the "link stops accepting
  answers at the exact end time" rule.

## Data model

```
teachers ──< teacher_sessions
batches ──< batch_students >── students
topics (self-ref) ──< questions
question_modules ──< module_questions >── questions
batches ──< exams ──< exam_paper_items      (frozen snapshot)
exams ──< attempts >── students
attempts ──< answers
attempts ──< violations
```

Design notes that matter:

- `students.roll_no_normalized` is unique. Copying a batch for a new semester
  reuses the same person; history therefore spans semesters.
- `exams` stores the schedule; `exam_paper_items` stores the frozen paper.
- `attempts` is unique on `(exam_id, student_id)` — one attempt per student per exam.
- `violations` is a log. `attempts.violation_count` is a convenience counter.

## Anti-cheat policy
Signals recorded: `visibility_hidden`, `window_blur`, `fullscreen_exit`, `copy`,
`paste`, `heartbeat_missed`, `clock_skew`, `devtools_suspected`.

These are **evidence for teacher review**. The product decision was explicitly
review-first: web platforms fire these on incoming calls and notifications, so
auto-banning would punish honest students. The teacher sees a timeline and acts.

## Question media

Some questions need a diagram. The teacher uploads an image; the Worker writes it
to R2 (`MATERIALS_BUCKET`) under a random key and the question stores `mediaKey`.
During an exam the student fetches `GET /api/media/:key` — unguessable key, so no
student session is needed, and the same asset works for the frozen paper snapshot.

## Caching policy (student app)

- **No service worker, no offline cache.** The student app is a plain web app.
- Rationale: a stale cached paper served after close would be a correctness bug,
  and nothing in the exam flow needs to work offline.
- The browser cache is enough: Vercel serves hashed `assets/*` immutably and
  `index.html` with revalidation.
- Devices that installed the old PWA unregister it on load (see
  `apps/student/src/main.tsx`) — removing the worker without that step would
  leave the old shell cached forever.

## Deployment

- **Admin** and **student**: Vercel, separate projects from the same repo
  (`apps/admin`, `apps/student`).
- **API**: Cloudflare Workers. `wrangler.toml` top-level = dev, `[env.production]`
  = prod, so a bare `wrangler deploy` cannot clobber production.
- **Namespace**: all resources are `kap-exam-*`.
