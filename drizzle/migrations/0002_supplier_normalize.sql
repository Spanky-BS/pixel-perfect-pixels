-- Normalized supplier product cache + server-only session store.
-- Authenticated clients must never read supplier_sessions (cookies stay off the frontend).

ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS gross_price numeric,
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS product_url text,
  ADD COLUMN IF NOT EXISTS last_updated timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS supplier_products_user_supplier_article
  ON public.supplier_products (user_id, supplier_id, supplier_article_no)
  WHERE supplier_article_no IS NOT NULL AND supplier_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.supplier_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  supplier_key text NOT NULL,
  encrypted_payload text NOT NULL,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, supplier_key)
);

GRANT ALL ON public.supplier_sessions TO service_role;
ALTER TABLE public.supplier_sessions ENABLE ROW LEVEL SECURITY;
-- No policies for authenticated: only service_role (bypass RLS) can read/write.

CREATE TRIGGER t_supplier_sessions BEFORE UPDATE ON public.supplier_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
