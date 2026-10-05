-- Internal product library for standalone use (no live supplier required).

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL DEFAULT '',
  description text,
  category_id uuid REFERENCES public.material_categories(id) ON DELETE SET NULL,
  manufacturer text,
  manufacturer_article_no text,
  supplier_name text,
  supplier_article_no text,
  unit text NOT NULL DEFAULT 'Stk',
  purchase_price numeric,
  sales_price numeric,
  markup numeric,
  notes text,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own products" ON public.products;
CREATE POLICY "own products" ON public.products FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP TRIGGER IF EXISTS t_products ON public.products;
CREATE TRIGGER t_products BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.material_requirements
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL;
