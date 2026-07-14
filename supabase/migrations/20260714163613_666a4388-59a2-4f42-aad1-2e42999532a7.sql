
CREATE TABLE public.render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  reel_id uuid REFERENCES public.reels(id) ON DELETE CASCADE,
  template_id text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  storage_path text,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  worker_url text,
  dispatched_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.render_jobs TO authenticated;
GRANT ALL ON public.render_jobs TO service_role;

ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their brand render jobs"
  ON public.render_jobs FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = render_jobs.brand_id AND b.owner_id = auth.uid()));

CREATE TRIGGER render_jobs_set_updated_at
  BEFORE UPDATE ON public.render_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.reels ADD COLUMN IF NOT EXISTS render_job_id uuid REFERENCES public.render_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS render_jobs_status_idx ON public.render_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS render_jobs_brand_idx ON public.render_jobs(brand_id);
