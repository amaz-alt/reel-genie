CREATE TABLE public.reaction_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('reaction','demo')),
  storage_path text NOT NULL,
  label text,
  duration_seconds numeric,
  width integer,
  height integer,
  ai_tags jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_used_at timestamp with time zone,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reaction_assets TO authenticated;
GRANT ALL ON public.reaction_assets TO service_role;
ALTER TABLE public.reaction_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages reaction assets" ON public.reaction_assets
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX reaction_assets_brand_kind_idx ON public.reaction_assets (brand_id, kind);

CREATE TRIGGER trg_reaction_assets_updated_at BEFORE UPDATE ON public.reaction_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reaction_reels (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  hook text,
  caption text,
  hashtags text[] NOT NULL DEFAULT '{}'::text[],
  reaction_asset_id uuid REFERENCES public.reaction_assets(id) ON DELETE SET NULL,
  demo_asset_id uuid REFERENCES public.reaction_assets(id) ON DELETE SET NULL,
  arrangement text,
  plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  render_job_id uuid REFERENCES public.render_jobs(id) ON DELETE SET NULL,
  storage_path text,
  video_url text,
  outstand_post_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamp with time zone,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reaction_reels TO authenticated;
GRANT ALL ON public.reaction_reels TO service_role;
ALTER TABLE public.reaction_reels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages reaction reels" ON public.reaction_reels
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE INDEX reaction_reels_brand_idx ON public.reaction_reels (brand_id, created_at DESC);

CREATE TRIGGER trg_reaction_reels_updated_at BEFORE UPDATE ON public.reaction_reels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();