# Deploying KAP EXAM

Three apps, two hosts. This is the whole path from a clean checkout to a live
system, in the order that avoids shipping a broken auth window.

| Piece              | What it is                                     | Host              |
| ------------------ | ---------------------------------------------- | ----------------- |
| `apps/api`         | Hono Worker + Durable Objects                  | Cloudflare        |
| `apps/admin`       | Teacher dashboard (Next.js)                    | Vercel            |
| `apps/student`     | Student exam PWA (Vite)                        | Vercel            |

Local development is covered in the root `README.md`; this file is only about
production.

---

## 0. Cloudflare resources (already done once)

Provisioning is idempotent-ish but these were created for this project. If you
are setting this up on a **new** Cloudflare account, re-run the three commands
and paste the new ids into `apps/api/wrangler.toml` — the same id goes in both
the top-level (dev) and the `[env.production]` block.

```sh
pnpm --filter @kap-exam/api exec wrangler d1 create kap-exam-db
pnpm --filter @kap-exam/api exec wrangler kv namespace create KV
pnpm --filter @kap-exam/api exec wrangler r2 bucket create kap-exam-materials
```

Current state of this account:

| Resource            | Value                                        |
| ------------------- | -------------------------------------------- |
| D1 `kap-exam-db`    | `7bf4d271-c727-4f01-b1e2-2979efc2f800` (APAC) |
| KV binding `KV`     | `e7a8fe06cb004b8cb6e79ceb7d77efee`            |
| R2 `kap-exam-materials` | created (R2 needs no id)                  |

**Dev and production share these three.** `wrangler dev` runs entirely on local
miniflare state, so it never touches them — which means the only things that do
are the deployed Worker and `pnpm db:migrate:remote`. Treat that script as a
production command.

The production schema is already applied (all three migrations in
`packages/db/migrations`). Re-running `pnpm db:migrate:remote` after adding a
migration is the normal flow.

---

## 1. Deploy the Worker

```sh
cd apps/api

# 1. Create the script. Auth is broken until step 2 runs, so do this back to back.
pnpm --filter @kap-exam/api deploy:prod     # = wrangler deploy --env production

# 2. The Worker refuses every session without this. It cannot be set first:
#    `wrangler secret put` needs an existing script.
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))" \
  | pnpm --filter @kap-exam/api exec wrangler secret put JWT_SECRET --env production

# 3. Sanity check.
curl https://<the-url-wrangler-printed>/health    # -> {"data":{"ok":true,"env":"production",...}}
```

Notes:

- `wrangler.toml`'s top-level config is the **dev** Worker
  (`kap-exam-api-dev`) precisely so that a bare `pnpm --filter @kap-exam/api
  deploy` cannot overwrite production. Production is only ever `--env
  production`.
- `ALLOWED_ORIGINS` under `[env.production]` is currently
  `https://kap-exam.vercel.app,https://kap-exam-student.vercel.app` — it must
  match your real Vercel URLs **exactly**, comma-separated, no trailing slash.
  A mismatch shows up as CORS errors in the browser console, not as a 5xx.
- **Preview deployments get blocked on purpose.** Vercel previews live at
  `kap-exam-git-<branch>-<team>.vercel.app`; those origins are not allow-listed.
  If you want previews to talk to the API, append them to `ALLOWED_ORIGINS` and
  redeploy the Worker.

---

## 2. Deploy the admin (Vercel)

Project settings:

| Setting          | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| Root Directory   | `apps/admin`                                                 |
| Framework        | Next.js (auto-detected)                                      |
| Install command  | auto — Vercel finds the pnpm workspace from the repo root    |

Environment variables — **set these before the first build**:

| Name                    | Value                                    | Why |
| ----------------------- | ---------------------------------------- | --- |
| `NEXT_PUBLIC_API_URL`   | `https://<worker-host>`                  | Inlined into the client bundle at build time. Left unset it silently falls back to `http://localhost:8787`, which is the classic "works locally, blank page in prod" bug. |
| `NEXT_PUBLIC_STUDENT_URL` | `https://kap-exam-student.vercel.app`  | Used to build the join link teachers share. |
| `GEMINI_API_KEY`        | your key (optional)                      | Server-only, read by the AI question generator route. Without it the feature returns a clear error and nothing else breaks. |
| `GEMINI_MODEL`          | optional                                 | Defaults to `gemini-3.5-flash-lite`. |

`.env.local` is gitignored and never travels to Vercel — everything above has to
be entered in the dashboard.

Because `NEXT_PUBLIC_*` is baked in at build time, changing a URL requires a
**redeploy**, not just a settings save.

---

## 3. Deploy the student PWA (Vercel)

| Setting          | Value                                                        |
| ---------------- | ------------------------------------------------------------ |
| Root Directory   | `apps/student`                                               |
| Framework        | Vite (auto-detected)                                         |
| Output directory | `dist`                                                       |

| Name           | Value                     | Why |
| -------------- | ------------------------- | --- |
| `VITE_API_URL` | `https://<worker-host>`   | Also build-time. Falls back to `http://localhost:8787`. |

`apps/student/vercel.json` already rewrites `/j/:code` to `index.html`. That one
line is load-bearing: **exam join links are opened cold** — scanned from a QR
code or tapped in a message — so the server has to serve the app shell for a
path that has no file behind it. The rewrite is deliberately scoped to `/j/`
rather than a catch-all so it can never swallow `sw.js` or the hashed bundles.

Service worker notes:

- `vite-plugin-pwa` registers the worker and injects the manifest link; there is
  nothing to wire up by hand.
- The worker caches the **app shell only**. Exam and answer responses are
  network-only by design — a stale paper after an exam closes would be a
  correctness bug, so do not add API routes to `runtimeCaching`.
- HTTPS comes free with Vercel; the PWA install criteria are met by the
  192/512 PNG icons plus the maskable variant in `apps/student/public`.

---

## 4. Seed the first teacher

1. Open `https://kap-exam.vercel.app/login`.
2. Use **Sign up** — it is available only while the production `teachers` table
   is empty, and the link disappears once the first account exists.
3. Sign in and create a batch.

Self-registration closes permanently after that. This is deliberate: the schema
is single-tenant (no teacher route filters by teacher id), so an open owner
signup on a public URL would hand any stranger the whole bank, every student
name + roll, and every result. The Worker enforces it in `signupIsOpen()` —
`GET /api/auth/signup-status` is what tells the login page whether to render
the link, and it is cosmetic only.

**Adding a second staff account later is not possible from the UI yet.** If you
need it, the follow-up is an owner-authenticated "create teacher" action — say
so and it can be built.

---

## 5. Verify after every deploy

```sh
curl https://<worker-host>/health                  # env must say "production"
```

Then in a browser, with devtools open:

- [ ] Admin login works (watch for CORS errors — that means `ALLOWED_ORIGINS`
      or `NEXT_PUBLIC_API_URL` is wrong).
- [ ] Question bank loads, a topic shows questions.
- [ ] `https://kap-exam-student.vercel.app/j/<joinCode>` opened **directly in a
      new tab** renders the join screen rather than a 404.
- [ ] Publish an exam and take it from the student app end to end.
- [ ] The join link the admin shows points at the student domain, not localhost.
- [ ] "Sign up" is no longer visible on the admin login page.
- [ ] Add to Home Screen on a phone installs with the KAP icon.

---

## Rollback

- **Worker:** `cd apps/api && pnpm --filter @kap-exam/api exec wrangler
  rollback --env production` (or pick a version in the Cloudflare dashboard).
- **Vercel:** promote a previous deployment from the project's Deployments tab —
  no rebuild needed.
- Migrations are forward-only. To undo a schema change, write a new migration
  rather than editing an applied one.

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

- `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` (which includes a
  `wrangler deploy --dry-run`, so a broken Worker bundle fails without touching
  Cloudflare)
- a second job boots `wrangler dev` on local D1/KV and runs the API end-to-end
  suite (`apps/api/scripts/e2e.mjs`) against it. No Cloudflare credentials are
  needed for either job.

CI never deploys. `pnpm format:check` is deliberately **not** a gate — a
repo-wide Prettier pass is a decision to make, not something to slip into a
pipeline (see `docs/decisions.md` D30).
