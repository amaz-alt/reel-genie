# Reelforge Render Worker — Deployment Verification Checklist

Run through this on the Hostinger VPS (Ubuntu 24.04, root). Every step should pass before you consider the renderer production-ready.

## 0. Prereqs on the VPS

- [ ] `docker --version` → Docker 24+ installed
- [ ] `docker compose version` → v2 plugin installed
- [ ] Ports: 8787 reachable locally; 443 open if you're fronting with Caddy/Nginx
- [ ] At least **2 GB RAM free** and **5 GB disk free** (Chromium + node_modules + image layers)

Nothing else needs to be installed manually. Node, Chromium (Chrome Headless Shell) and FFmpeg are all inside the container.

## 1. Clone + configure

```bash
git clone <your-repo> reelforge && cd reelforge/render-worker
cp .env.example .env
# paste values from Lovable secrets panel:
#   RENDER_WORKER_TOKEN=...
#   RENDER_CALLBACK_SECRET=...
#   PUBLIC_APP_URL=https://<your-lovable-app-domain>
```

- [ ] `.env` contains all 3 values, no trailing spaces

## 2. Build

```bash
docker compose up -d --build
```

Expected: image builds in 3–6 min, ends with `RUN npx remotion browser ensure` downloading Chrome Headless Shell. Container starts and stays `Up`.

- [ ] `docker compose ps` → `reelforge-render-worker` is `Up`
- [ ] `docker compose logs --tail=50 render-worker` shows `render-worker listening on :8787` and no crash loop

## 3. Local health check

```bash
curl -s http://127.0.0.1:8787/health
```

- [ ] Returns `{"ok":true,"version":"0.1.0"}`
- [ ] `curl -s http://127.0.0.1:8787/render` returns `{"error":"Unauthorized"}` (auth is enforced)

## 4. TLS front (Caddy example)

`/etc/caddy/Caddyfile`:
```
render.yourdomain.com {
  reverse_proxy 127.0.0.1:8787
}
```

- [ ] `curl -s https://render.yourdomain.com/health` → `{"ok":true,...}`
- [ ] DNS A record for `render.yourdomain.com` → VPS IP

## 5. Wire into Lovable

Give me the public URL — I'll save it as the `VPS_RENDER_URL` secret. Then:

- [ ] Open a brand in Lovable, click **Render test reel**
- [ ] `docker compose logs -f render-worker` shows `POST /render`, then `renderMedia` progress, then a `POST` back to `PUBLIC_APP_URL/api/public/render/callback`
- [ ] In Lovable, the reel row flips from `queued` → `rendering` → `ready` within ~60–90 s
- [ ] The reel's video URL plays a 1080×1920 MP4 with the brand's copy

## 6. Sanity: resource usage

Under load a single render should use ~1 CPU core and 500–900 MB RAM for 20–40 s.

```bash
docker stats reelforge-render-worker
```

- [ ] CPU spikes to ~100% during render, drops to idle after
- [ ] Memory stays under 1.5 GB

## 7. Failure paths (quick smoke)

- [ ] Send a `/render` POST with a bogus signed upload URL → callback fires with `status:"failed"` and an error message, container does NOT crash
- [ ] Restart the container (`docker compose restart`) → comes back healthy in <10 s

## Versions (pinned)

- Node 20 (`node:20-slim`)
- Remotion **4.0.315** (`remotion`, `@remotion/bundler`, `@remotion/renderer`)
- Fastify 4.28.1
- React / React-DOM 18.3.1
- Chrome Headless Shell: pulled by `@remotion/renderer` 4.0.315 at image build time
- FFmpeg: bundled inside `@remotion/renderer` (no system ffmpeg needed)

If any check above fails, grab `docker compose logs --tail=200 render-worker` and send it over.
