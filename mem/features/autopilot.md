---
name: Autopilot + Google Drive archive
description: How the unattended generate/archive/publish pipeline works and what must never be broken
type: feature
---

- Cron `reelforge-autopilot-tick` (pg_cron, every 15 min) POSTs
  `/api/public/autopilot/tick` on the stable Lovable preview URL with the
  publishable key in the `apikey` header. If the tool moves to a Vercel domain,
  re-point this job's URL.
- `src/lib/autopilot.server.ts` runs three passes per tick: generate (due
  schedules) → archive to Google Drive → publish via Outstand.
- Autopilot reuses `generateReelCore` and `publishReelCore` — it must never
  fork or reimplement the typography/reaction render engines.
- Per-brand switches live on `brand_schedules`: `autopilot_enabled`,
  `auto_publish`, `posts_per_day` (slots spread evenly from `time_of_day`),
  `last_run_at` guards double-firing.
- Drive: service account (`GOOGLE_SERVICE_ACCOUNT_JSON`) uploads into a
  per-brand subfolder of the user's parent folder; the user must share that
  folder with the service account email as Editor.
