
CREATE TABLE public.brand_references (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  storage_path text NOT NULL,
  label text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX brand_references_brand_id_idx ON public.brand_references(brand_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_references TO authenticated;
GRANT ALL ON public.brand_references TO service_role;
ALTER TABLE public.brand_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages references" ON public.brand_references
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
