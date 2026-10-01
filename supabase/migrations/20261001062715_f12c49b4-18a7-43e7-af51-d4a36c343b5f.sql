CREATE TABLE public.broll_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  storage_path text NOT NULL,
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broll_assets TO authenticated;
GRANT ALL ON public.broll_assets TO service_role;
ALTER TABLE public.broll_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their B-roll clips" ON public.broll_assets FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.broll_hooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  hook_text text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT broll_hooks_brand_owner_text_unique UNIQUE (brand_id, owner_id, hook_text)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broll_hooks TO authenticated;
GRANT ALL ON public.broll_hooks TO service_role;
ALTER TABLE public.broll_hooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their B-roll hooks" ON public.broll_hooks FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE public.broll_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  asset_id uuid REFERENCES public.broll_assets(id) ON DELETE SET NULL,
  hook_id uuid REFERENCES public.broll_hooks(id) ON DELETE SET NULL,
  hook_text text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  render_job_id uuid REFERENCES public.render_jobs(id) ON DELETE SET NULL,
  storage_path text,
  video_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broll_reels TO authenticated;
GRANT ALL ON public.broll_reels TO service_role;
ALTER TABLE public.broll_reels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage their B-roll reels" ON public.broll_reels FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX broll_assets_brand_order_idx ON public.broll_assets (brand_id, sort_order, created_at);
CREATE INDEX broll_hooks_unused_idx ON public.broll_hooks (brand_id, used_at, created_at);
CREATE INDEX broll_reels_brand_created_idx ON public.broll_reels (brand_id, created_at DESC);