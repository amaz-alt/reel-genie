
-- Normalize existing statuses to the new set
UPDATE public.render_jobs SET status = 'rendering' WHERE status = 'dispatched';
UPDATE public.render_jobs SET status = 'completed' WHERE status = 'done';

ALTER TABLE public.render_jobs
  ADD COLUMN IF NOT EXISTS logs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3;

-- Enforce the four canonical statuses
ALTER TABLE public.render_jobs DROP CONSTRAINT IF EXISTS render_jobs_status_check;
ALTER TABLE public.render_jobs
  ADD CONSTRAINT render_jobs_status_check
  CHECK (status IN ('queued','rendering','completed','failed'));
