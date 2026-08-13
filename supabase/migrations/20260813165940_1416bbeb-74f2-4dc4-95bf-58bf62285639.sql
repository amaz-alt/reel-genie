-- Autopilot + Google Drive archive

ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS drive_folder_id text;

ALTER TABLE public.reels
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_url text,
  ADD COLUMN IF NOT EXISTS drive_synced_at timestamptz;

ALTER TABLE public.brand_schedules
  ADD COLUMN IF NOT EXISTS autopilot_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS posts_per_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_run_at timestamptz;

CREATE TABLE IF NOT EXISTS public.autopilot_settings (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  drive_parent_folder_id text,
  drive_parent_url text,
  drive_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.autopilot_settings TO authenticated;
GRANT ALL ON public.autopilot_settings TO service_role;
ALTER TABLE public.autopilot_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own autopilot settings"
  ON public.autopilot_settings FOR ALL TO authenticated
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS public.autopilot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  brand_id uuid REFERENCES public.brands(id) ON DELETE CASCADE,
  reel_id uuid,
  stage text NOT NULL,
  status text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.autopilot_runs TO authenticated;
GRANT ALL ON public.autopilot_runs TO service_role;
ALTER TABLE public.autopilot_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view their own autopilot runs"
  ON public.autopilot_runs FOR SELECT TO authenticated
  USING (auth.uid() = owner_id);

CREATE INDEX IF NOT EXISTS autopilot_runs_owner_created_idx
  ON public.autopilot_runs (owner_id, created_at DESC);