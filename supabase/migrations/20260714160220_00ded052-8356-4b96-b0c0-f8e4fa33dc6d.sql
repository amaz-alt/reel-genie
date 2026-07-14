
-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- BRANDS
-- =========================================================
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  google_sheet_url text,           -- full user-pasted URL
  google_sheet_id text,             -- parsed id
  sheet_tab text DEFAULT 'Sheet1',
  sheet_range text DEFAULT 'A1:Z1000',
  knowledge_base text DEFAULT '',
  template_id text,                 -- key of chosen Creatomate template
  brand_colors jsonb NOT NULL DEFAULT '{"primary":"#111111","accent":"#ff3b30","background":"#ffffff","text":"#111111"}'::jsonb,
  brand_fonts jsonb NOT NULL DEFAULT '{"display":"Inter","body":"Inter"}'::jsonb,
  logo_url text,
  reference_reel_url text,
  outstand_account_ids jsonb NOT NULL DEFAULT '[]'::jsonb,   -- array of platform account ids
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brands_owner_idx ON public.brands(owner_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages brands" ON public.brands FOR ALL TO authenticated USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE TRIGGER trg_brands_updated_at BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- BRAND SCHEDULES
-- =========================================================
CREATE TABLE public.brand_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  days_of_week int[] NOT NULL DEFAULT '{1,2,3,4,5}',   -- 0=Sun..6=Sat
  time_of_day time NOT NULL DEFAULT '09:00',
  timezone text NOT NULL DEFAULT 'UTC',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brand_schedules_brand_idx ON public.brand_schedules(brand_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_schedules TO authenticated;
GRANT ALL ON public.brand_schedules TO service_role;
ALTER TABLE public.brand_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner manages schedules" ON public.brand_schedules FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_id = auth.uid()));
CREATE TRIGGER trg_brand_schedules_updated_at BEFORE UPDATE ON public.brand_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- PRODUCTS CONSUMED (rotation memory)
-- =========================================================
CREATE TABLE public.products_consumed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_row_key text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, product_row_key)
);
CREATE INDEX products_consumed_brand_idx ON public.products_consumed(brand_id, consumed_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products_consumed TO authenticated;
GRANT ALL ON public.products_consumed TO service_role;
ALTER TABLE public.products_consumed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads consumed" ON public.products_consumed FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_id = auth.uid()));

-- =========================================================
-- REELS
-- =========================================================
CREATE TYPE public.reel_status AS ENUM ('queued','generating_copy','rendering','ready','publishing','published','failed');

CREATE TABLE public.reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  product_row_key text,
  product_snapshot jsonb,
  hook text,
  caption text,
  hashtags text[] DEFAULT '{}',
  template_id text,
  render_provider_id text,          -- Creatomate render id
  video_url text,
  status public.reel_status NOT NULL DEFAULT 'queued',
  scheduled_for timestamptz,
  published_at timestamptz,
  outstand_post_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reels_brand_idx ON public.reels(brand_id, created_at DESC);
CREATE INDEX reels_status_idx ON public.reels(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reels TO authenticated;
GRANT ALL ON public.reels TO service_role;
ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner reads reels" ON public.reels FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_id = auth.uid()));
CREATE POLICY "Owner writes reels" ON public.reels FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_id = auth.uid()));
CREATE POLICY "Owner updates reels" ON public.reels FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_id = auth.uid()));
CREATE POLICY "Owner deletes reels" ON public.reels FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_id = auth.uid()));
CREATE TRIGGER trg_reels_updated_at BEFORE UPDATE ON public.reels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
