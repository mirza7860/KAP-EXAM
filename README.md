# KAP EXAM

Exam system for a coaching center: a reusable question bank, time-boxed CBT
exams taken on a phone, and report cards that survive semester changes.

## Apps & packages

| Path              | What it is                                              | Deploy            |
| ----------------- | ------------------------------------------------------- | ----------------- |
| `apps/admin`      | Teacher dashboard (Next.js, App Router, Tailwind v4)   | Vercel            |
| `apps/student`    | Student exam PWA (Vite + React, `vite-plugin-pwa`)     | Vercel            |
| `apps/api`        | API + Durable Objects (Hono on Cloudflare Workers)     | Cloudflare        |
| `packages/db`     | Drizzle schema + D1 migrations                         | —                 |
| `packages/shared` | Zod schemas, domain types, timing rules                | —                 |
| `packages/ui`     | Shared shadcn-style components + design tokens         | —                 |

## The shape of the product

- **Question bank** — topics → subtopics → questions. Teachers compose an exam
  from a topic's pool or hand-picked questions. There is no separate "module"
  layer: topics are the pools (see D13).
- **Batches** — semester cohorts. Copy a batch to roll into a new semester; the
  copy takes the roster, never the past exams.
- **Exams** — fixed wall-clock window + per-attempt duration. Publishing
  **freezes** the paper so report cards never change under you.
- **Attempts** — one student, one exam, server-stamped deadline.
- **Reports** — per-exam rosters (ascending, printable) and per-student
  cumulative report cards that span batches.

## Invariants

Read these before changing the schema or the Worker.

1. **The student's browser is untrusted.** The authoritative clock, attempt
   state and violation log live in a Durable Object per exam. The client only
   renders what the server tells it.
2. **History is immutable.** `exam_paper_items` snapshots each question at
   publish time. Editing a question later never rewrites a past exam.
3. **A student is a stable person across semesters.** Match key is the
   normalized roll number. Batches are time slices joined via `batch_students`.
4. **Violations are recorded, not punished.** Exiting/tampering is logged and
   surfaced to the teacher for review. Nothing auto-bans.
5. **Never cache exam answers.** The PWA service worker caches the app shell only.

See [`docs/architecture.md`](docs/architecture.md) and
[`docs/decisions.md`](docs/decisions.md).

## Getting started

```bash
pnpm install

# 1. Create Cloudflare resources (namespaced with `kap-exam-`, see wrangler.toml)
pnpm --filter @kap-exam/api exec wrangler d1 create kap-exam-db
pnpm --filter @kap-exam/api exec wrangler kv namespace create KV
pnpm --filter @kap-exam/api exec wrangler r2 bucket create kap-exam-materials

# 2. Put the returned ids into apps/api/wrangler.toml, then:
cp apps/api/.dev.vars.example apps/api/.dev.vars   # set JWT_SECRET

# 3. Generate + apply migrations
pnpm db:generate
pnpm db:migrate:local

# 4. Run everything
pnpm dev
```

Default dev ports: admin `3000`, student `5173`, api `8787`.

> **Note:** the Cloudflare resources already exist and their ids are already in
> `apps/api/wrangler.toml`, so step 1 is a no-op here. Local D1 state is keyed by
> `database_id`, so changing that id moves your local database — copy
> `.wrangler/state/v3/d1/` across if you ever have to.

## Deployment

Production is covered end to end in [`docs/deploy.md`](docs/deploy.md): which
Cloudflare resources exist, the order to deploy the Worker and set
`JWT_SECRET`, the Vercel settings and build-time env vars for both web apps,
seeding the first teacher, and a post-deploy checklist.

In short: **API → Cloudflare Workers, both web apps → Vercel**, and
`NEXT_PUBLIC_API_URL` / `VITE_API_URL` must be set before the first build
because they are inlined into the bundle.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests, build and the API
e2e suite on every push and pull request. It never deploys.

## Conventions

- pnpm workspaces + Turborepo. One lockfile at the root.
- Workspace packages are consumed as TypeScript source (no build step).
- Tailwind v4 is CSS-first; tokens live in `packages/ui/src/styles/theme.css`.
- Cloudflare resources are always prefixed `kap-exam-` to avoid collisions.
