# B-roll Vids

Add a standalone per-brand B-roll section where users can upload and manage up to 15 short videos, paste any number of hook lines (one per line), and generate one reel per hook. Each hook is consumed once, and clips are assigned in upload order with rotation when the hook list is longer than the clip library. Generated MP4s remain available in the section; do not change existing Typography or Reaction + Demo workflows.

## Technical details

- Add a dedicated brand route and a link from the brand page, following the existing isolated Reaction + Demo module pattern.
- Reuse the existing private video storage bucket with a dedicated B-roll path prefix. Add owner-scoped tables for clips, queued/consumed hook lines, and rendered B-roll reels, with explicit grants and RLS in the same migration.
- Add isolated server functions and UI for multi-upload, clip preview/delete, multiline hook import, one-time hook claiming, deterministic clip rotation, render status, preview, and download.
- Add a new Remotion composition that uses the source clip with a readable brand-colour hook overlay, and register it for the existing render worker without changing existing compositions.
- Record the new module boundary in AGENTS.md and verify the route, batch flow, rendering status behavior, and build.