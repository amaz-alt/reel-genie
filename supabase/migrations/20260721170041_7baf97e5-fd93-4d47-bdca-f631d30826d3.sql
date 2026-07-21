
CREATE TABLE public.brand_social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  network TEXT NOT NULL,
  outstand_account_id TEXT NOT NULL,
  username TEXT,
  nickname TEXT,
  network_unique_id TEXT,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand_id, network, outstand_account_id)
);

CREATE INDEX brand_social_accounts_brand_idx ON public.brand_social_accounts(brand_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.brand_social_accounts TO authenticated;
GRANT ALL ON public.brand_social_accounts TO service_role;

ALTER TABLE public.brand_social_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage brand social accounts"
  ON public.brand_social_accounts
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.brands b WHERE b.id = brand_id AND b.owner_id = auth.uid()));

CREATE TRIGGER brand_social_accounts_updated_at
  BEFORE UPDATE ON public.brand_social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
