# Reel Generator — Option B: VPS Render Worker

Split cleanly: **Lovable owns everything except pixel rendering. The VPS is a dumb render box.**

```text
[Lovable app] ── enqueue job ──► [render_jobs table]
       ▲                                │
       │ signed upload URL              │ HTTP POST /render (bearer)
       │ + webhook callback             ▼
       │                        [VPS: Node + Remotion + Chromium in Docker]
       │                                │
       │ ◄── PUT MP4 to storage ────────┤
       │ ◄── POST /api/public/render/callback (HMAC) ─┘
       ▼
   reels.status = ready → publish step
```

## What lives where

**Lovable (this project)**
- All 15–20 Remotion templates (React/TSX) live in `remotion/` in this repo. They are the source of truth. The VPS clones/pulls them at deploy or fetches a bundle URL per job.
- `RenderService` abstraction (interface + one impl `VpsRenderService`).
- `render_jobs` table + queue worker (server function triggered by cron).
- AI copy generation (Lovable AI Gateway).
- Sheet reading, product rotation, scheduling, publishing (Outstand later).
- Callback endpoint the VPS calls when render finishes.

**VPS (isolated service)**
- Single Docker container: Node 20 + `@remotion/renderer` + headless Chromium.
- Tiny Fastify app exposing:
  - `POST /render` — accepts job, renders, uploads, calls callback. Auth: `Authorization: Bearer <RENDER_WORKER_TOKEN>`.
  - `GET /health` — liveness.
- Zero state. No DB. Job payload is self-contained.

## Data model (new)

`render_jobs`
- id, brand_id, reel_id, template_id, props (jsonb), status (queued|dispatched|rendering|uploading|done|failed), attempts, last_error, worker_url, dispatched_at, completed_at, created_at, updated_at.

`reels` gains: `render_job_id`.

RLS: owner via brand; service_role full.

## RenderService interface

```ts
// src/lib/render/RenderService.ts
export interface RenderService {
  submit(job: RenderJobPayload): Promise<{ workerJobId: string }>;
}
```

Impl `VpsRenderService` POSTs to `${VPS_URL}/render` with `Bearer RENDER_WORKER_TOKEN`. Swapping renderers later = new impl, no callers change.

## Job payload (Lovable → VPS)

```json
{
  "jobId": "uuid",
  "templateId": "kinetic-type",
  "durationInFrames": 180,
  "fps": 30,
  "width": 1080,
  "height": 1920,
  "props": { "hook": "...", "brand": { "colors": {...}, "fonts": {...}, "logoUrl": "..." }, "product": {...} },
  "upload": { "signedUrl": "https://...supabase.../object/upload/sign/...", "path": "brand/../reel.mp4" },
  "callback": { "url": "https://project--<id>.lovable.app/api/public/render/callback", "hmacKeyId": "v1" }
}
```

Callback body is signed with `RENDER_CALLBACK_SECRET` (HMAC-SHA256 over raw body). Lovable verifies before updating `render_jobs` + `reels`.

## Flow per scheduled run

1. Daily cron `/api/public/cron/run` (existing plan) picks brands due today.
2. For each: read Sheet → pick next unused product → AI copy → insert `reels` row (queued) + `render_jobs` row (queued).
3. Queue drainer server fn: for each `queued` job, create signed upload URL for `reels/{id}.mp4` in `brand-assets`, POST job to VPS, mark `dispatched`.
4. VPS renders with Remotion (`renderMedia`), streams MP4 to the signed URL, POSTs signed callback `{ jobId, status, error? }`.
5. Callback route marks `render_jobs.done`, sets `reels.video_url` to signed read URL, transitions `reels.status = ready`.
6. Publish step (Outstand, wired later) picks up `ready` reels.

Retries: on VPS failure or callback timeout > 15 min, drainer retries up to 3 with backoff.

## VPS worker package (delivered as `render-worker/` in repo, deployed manually to VPS)

Structure:
```
render-worker/
  Dockerfile           # node:20-slim + Chromium deps
  docker-compose.yml   # single service, restart: always, port 8787
  package.json
  src/server.ts        # Fastify: /render, /health, bearer auth
  src/render.ts        # bundle() + renderMedia() + upload via fetch PUT
  remotion/            # symlink or copy of templates from main repo
  .env.example         # RENDER_WORKER_TOKEN, RENDER_CALLBACK_SECRET
  README.md            # 5-step deploy on Hostinger VPS
```

Deploy on VPS: `git clone` → `cp .env.example .env` → fill token/secret → `docker compose up -d`. Point Lovable at `https://<vps-host>:8787` (or behind Caddy for TLS — recommended, README covers it).

## Templates (Lovable-side)

Start with 4 in this ticket, scaffold the rest as stubs:
- `kinetic-type`, `product-showcase`, `quote-card`, `before-after`.

Each is a Remotion composition in `remotion/compositions/<id>.tsx` accepting a typed `props` schema. `remotion/Root.tsx` registers them; template picker in the wizard reads the same registry.

## Secrets (Lovable side, added via add_secret when you approve)

- `VPS_RENDER_URL` — e.g. `https://render.yourdomain.com`
- `RENDER_WORKER_TOKEN` — random, we generate
- `RENDER_CALLBACK_SECRET` — random, we generate, also placed in VPS `.env`

## What I'll build this turn

1. `render_jobs` table + RLS + grants; `reels.render_job_id` column.
2. `remotion/` scaffold with `Root.tsx`, 4 compositions, shared brand-token props.
3. `src/lib/render/RenderService.ts` + `VpsRenderService`.
4. `src/lib/render.functions.ts`: `enqueueRender`, `drainRenderQueue` (server fns).
5. `src/routes/api/public/render/callback.ts` (HMAC-verified).
6. `render-worker/` folder with Dockerfile, compose, Fastify server, README.
7. Generate `RENDER_WORKER_TOKEN` + `RENDER_CALLBACK_SECRET`; ask you for `VPS_RENDER_URL` after deploy.

## Out of scope this turn

- Wiring publish to Outstand (waiting on their docs/key — you said later).
- Cron pipeline itself (`/api/public/cron/run`) — I'll wire it in the next slice once the render path is verified end-to-end with a "Render now" button.

Approve and I ship the above.
