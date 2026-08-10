# Reaction + Demo Reels — standalone module

A second, fully isolated content engine that sits beside the existing Typography Reels
section. Nothing in the current engine (templates, pacing, palette, publishing) is
touched: new tables, new storage bucket, new components, new route, new Remotion
composition, new server-function file.

## What the user gets

1. A new nav entry **Reaction Reels** inside a brand, plus its own asset library.
2. Two asset libraries per brand:
   - **Reaction clips** (UGC faces/expressions, 100+)
   - **Demo clips** (short product screen recordings, 4-10s, 100+)
   Upload many at once, see thumbnails, filter, delete, re-tag.
3. Every uploaded clip is auto-understood by AI and tagged with:
   emotion, energy, topic/feature, what is visibly happening, best-use note,
   suitable pairing tags, and duration.
4. A **Generate** button (and scheduled runs) that:
   - picks a demo clip (rotating, least-recently-used),
   - picks a compatible reaction clip using the tag match, not randomness,
   - writes one short curiosity one-liner for that exact demo
     ("I wish I found this 3 years ago."),
   - assembles reaction + demo in one of several natural arrangements/timings,
   - renders 1080x1920 MP4 through the existing render worker,
   - is publishable with the existing Outstand publish button.

## Variation engine

Each generation differs by combining:
- arrangement: reaction-first cut, reaction-first with demo picture-in-picture,
  split-stack (reaction top / demo bottom), demo-first with late reaction sting
- hook placement: over reaction, over demo, or both halves
- hook timing: instant, on-beat, or delayed reveal
- text treatment: caption bar, boxed lockup, or clean drop shadow line
- reaction duration, demo trim start, and asset choice

A seed derived from the reel id keeps a render reproducible while a
per-brand "recently used" ledger prevents repeats of clip pairs and arrangements.

## Technical plan

### Data (new tables only)
- `reaction_assets` — brand_id, owner_id, kind (`reaction` | `demo`), storage_path,
  duration_seconds, width/height, label, ai_tags jsonb, last_used_at, created_at.
- `reaction_reels` — brand_id, hook, caption, hashtags, reaction_asset_id,
  demo_asset_id, arrangement, plan jsonb, status, video_url, storage_path,
  error, created_at. Mirrors the existing reels lifecycle without sharing it.
- Storage: new private bucket `reaction-assets` with owner-scoped RLS.
- GRANTs + RLS on both tables (authenticated owner-scoped, service_role full).

### Server functions — `src/lib/reaction.functions.ts` (new file)
- `createReactionAssetUploadUrl`, `addReactionAsset` (accepts client-extracted
  frames + duration), `listReactionAssets`, `retagReactionAsset`,
  `deleteReactionAsset`
- `generateReactionReel` — AI tag-aware pairing + one-liner generation, then
  enqueues a `render_jobs` row with `template_id = "reaction-demo"` and signed
  clip URLs in props.
- `listReactionReels`
AI calls use the Lovable AI Gateway with vision on extracted frames, same
pattern already used for reference-vault analysis.

### Render
- `remotion/compositions/reaction-demo.tsx` — new composition using
  `OffthroughVideo`/`OffthreadVideo` for both clips, registered in `Root.tsx`
  as a new id. Existing compositions and `remotion/brand.ts` are left as-is
  (any shared helper it needs is added in a new file).
- Worker needs no code change: it already renders by composition id with
  inputProps, so only a redeploy to pick up the new composition.

### UI (new components only)
- `src/components/reaction/AssetLibrary.tsx` — dual-tab uploader/grid.
- `src/components/reaction/ReactionReelsPanel.tsx` — generate + list + publish.
- New route `src/routes/_authenticated/app.brands.$brandId.reactions.tsx`, linked
  from the brand page with a single added link (the only edit to an existing file).

### Isolation guarantees
- No edits to `render.functions.ts`, `templates.ts`, existing compositions,
  `music-library.ts`, or `outstand.functions.ts` logic beyond, at most, adding a
  new publish entry point if reaction reels need it.
- New template id is not added to the typography rotation list.
