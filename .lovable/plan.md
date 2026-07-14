# Automated Short-Form Reel Generator — v1 plan

## Architecture at a glance

```text
[Dashboard UI]  ──►  [Server functions]  ──►  [Lovable Cloud DB]
                          │
                          ├─► Google Sheets (read next unused product)
                          ├─► Lovable AI Gateway (hook + caption + hashtags)
                          ├─► Video render API (template + text → MP4)
                          └─► Outstand.so API (publish)

[Daily cron  →  /api/public/cron/run]  ──► fans out per-brand jobs due today
```

## Stack decisions

- **DB / auth / storage**: Lovable Cloud (Supabase under the hood).
- **AI**: Lovable AI Gateway, `google/gemini-3-flash-preview` (Gemini > OpenAI for cost/latency on short copy; if you specifically need OpenAI say so).
- **Video rendering**: **Creatomate** (or Shotstack — pick one). Cloudflare Workers can't run Remotion/ffmpeg. These services accept a JSON template + variables → MP4 URL. This is the only realistic path for auto-rendered 1080×1920 MP4 in this stack. You'll need to sign up (both have free tiers) and paste an API key.
- **Templates**: I hand-build 4 starter Creatomate templates (kinetic type, split-screen product, quote-card, before/after). Each brand picks a template + supplies colors, fonts, logo. Reference reel is stored for human comparison only.
- **Cron**: single daily cron hits `/api/public/cron/run` (HMAC-signed). It reads every brand's schedule, picks the ones due today, and runs the pipeline per brand.
- **Publishing**: Outstand.so API — I need docs + key from you before wiring.

## Data model (Lovable Cloud)

- `brands` — id, owner user_id, name, google_sheet_id, sheet_tab, sheet_range, knowledge_base (text), template_id, brand_colors (jsonb), brand_fonts (jsonb), reference_reel_url, outstand_account_ids (jsonb), created_at
- `brand_schedules` — brand_id, days_of_week (int[]), time_of_day (HH:MM), timezone, active
- `products_consumed` — brand_id, product_row_key (sheet row id or hash), consumed_at  ← rotation memory
- `reels` — id, brand_id, product_row_key, hook, caption, hashtags, video_url, status (queued|rendering|ready|published|failed), scheduled_for, published_at, outstand_post_ids (jsonb), error
- `user_roles` — standard has_role pattern

Grants + RLS: owner reads/writes own brand data; service_role for cron/render jobs.

## Pipeline (per brand, per scheduled run)

1. Read Google Sheet → get all product rows.
2. Diff against `products_consumed` for that brand → pick the oldest-unused row (falls back to least-recently-consumed if all seen, giving rotation).
3. Call Lovable AI with brand KB + product row → structured output `{ hook (≤12 words), caption, hashtags[] }`.
4. POST to Creatomate: `{ template_id: brand.template_id, modifications: { hook, caption, brand_colors, brand_fonts, logo, product_image } }` → poll for MP4 URL.
5. Store row in `reels` (status ready).
6. Call Outstand.so publish endpoint with the MP4 + caption + hashtags per connected social account.
7. Mark product consumed, mark reel published.

## UI surface (single dashboard app)

- `/` — landing / login
- `/app` — auth-gated: list of brands, "New brand" button
- `/app/brands/new` — 5-step wizard: name → connect Google Sheet (paste sheet URL, pick tab) → schedule → knowledge base → colors/fonts + template + reference reel upload → Outstand accounts
- `/app/brands/$id` — brand detail: schedule, KB, template, past reels grid, next scheduled run, "Run now" button
- `/app/brands/$id/reels/$reelId` — MP4 preview, caption, hashtags, publish status

## Things I need from you to finish v1

1. **Creatomate (or Shotstack) API key** — I'll add it via `add_secret` after you confirm which.
2. **Outstand.so API docs URL** + **API key** — I'll wire the publish call from their docs.
3. **Google Sheets connection method** — easiest is a **published-to-web CSV** URL per brand (no OAuth). Alternative: builder-owned Google Sheets connector (one account reads all brands' sheets). Say which.

## Technical details

- Cron endpoint: `POST /api/public/cron/run` — HMAC over raw body with `CRON_SECRET` (auto-generated). Idempotent per (brand, day).
- Rendering: Creatomate render calls are async — server function submits, stores render id, and a second cron poll (`/api/public/cron/poll`) finalizes and publishes when ready.
- No ffmpeg / no Remotion in-process. Video work happens entirely at the render service.
- Reference reel MP4 is stored in Lovable Cloud storage; it's a design brief for the human choosing a template, not machine-consumed.
- All secrets (`LOVABLE_API_KEY`, `CREATOMATE_API_KEY`, `OUTSTAND_API_KEY`, `CRON_SECRET`) stay server-side.

## Explicitly OUT of scope for v1

- Analytics on posts (impressions, saves) — additive later.
- Auto-picking product images from the sheet if the sheet has no image column — templates that need an image will require an image URL column.
- True motion-design cloning of the reference reel — not solvable today; template picker + brand tokens is the honest substitute.
- Per-platform caption variants — one caption + hashtag set across all connected accounts in v1.

Approve and I'll start with: Lovable Cloud enablement → schema + auth → brand CRUD + wizard → AI copy + Creatomate render → Outstand publish → cron. I'll pause after schema + auth for a quick check-in.
