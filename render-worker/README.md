# Reelforge Render Worker

A tiny, stateless HTTP service that renders Remotion compositions into
1080×1920 MP4s and uploads them back to Lovable storage. Deployed on the
customer's VPS (Ubuntu 24.04 + Docker).

## Contract

```
POST /render          Bearer <RENDER_WORKER_TOKEN>
GET  /health          Bearer <RENDER_WORKER_TOKEN>
```

Request body (`POST /render`) — self-contained, no DB lookups needed:

```json
{
  "jobId": "uuid",
  "templateId": "kinetic-type",
  "width": 1080,
  "height": 1920,
  "fps": 30,
  "durationInFrames": 180,
  "props": { "hook": "...", "brand": { ... } },
  "upload": { "signedUrl": "https://...", "path": "..." },
  "callback": { "url": "https://.../api/public/render/callback", "hmacKeyId": "v1" }
}
```

The worker responds `202 { jobId }` immediately and processes asynchronously.
When rendering finishes it PUTs the MP4 to `upload.signedUrl`, then POSTs the
callback with an `x-render-signature` HMAC header.

## Deploy (Hostinger VPS, Ubuntu 24.04)

```bash
# 1. Clone this repo somewhere on the VPS
git clone <this-repo> reelforge && cd reelforge/render-worker

# 2. Configure secrets — copy the values Lovable generated for you
cp .env.example .env
nano .env   # fill RENDER_WORKER_TOKEN and RENDER_CALLBACK_SECRET

# 3. Bring it up
docker compose up -d --build

# 4. Confirm
curl -H "authorization: Bearer $RENDER_WORKER_TOKEN" http://localhost:8787/health
```

Put Caddy or nginx in front of it for TLS (recommended) — Lovable will call
`https://render.yourdomain.com/render`. Minimal Caddyfile:

```
render.yourdomain.com {
  reverse_proxy localhost:8787
}
```

Then in Lovable, add the secret `VPS_RENDER_URL=https://render.yourdomain.com`.

## Notes

- Templates come from the sibling `../remotion/` folder in this repo. Pull
  the repo on the VPS to update templates; no code change on the worker.
- The container installs Chromium via `@remotion/renderer`'s
  `ensureBrowser()` on first run.
- Zero state: restarts are safe; in-flight jobs Lovable considers timed out
  will be retried automatically.
