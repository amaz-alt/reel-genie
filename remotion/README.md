# Remotion Templates (shared source of truth)

These React compositions are the visual templates the render worker uses.
They live in the main Lovable repo so the app and worker stay in sync — the
VPS worker consumes this folder verbatim.

## Layout

- `Root.tsx` — registers every composition (id, dimensions, fps, defaults).
- `compositions/<templateId>.tsx` — one file per template. Props are typed.
- `brand.ts` — shared brand-token types (colors, fonts, logo).

## Adding a template

1. Create `compositions/my-template.tsx` exporting `MyTemplate` component +
   `myTemplateSchema` (zod) if you want runtime prop validation.
2. Register it in `Root.tsx` with a unique id, 1080×1920, 30fps.
3. Add its metadata to `src/lib/templates.ts` in the main app so the picker
   shows it.

## Rendering locally

The worker (see `../render-worker/`) bundles this folder with
`@remotion/bundler` and renders with `@remotion/renderer`. No Remotion Studio
needed for production; run `bunx remotion studio remotion/Root.tsx` from the
worker for previewing during template development.
