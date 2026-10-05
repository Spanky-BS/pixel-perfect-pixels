-- Supplier invoice capture (uploaded files only, no live shop).
-- Confirmed nets feed Nachkalkulation. Product master changes need user confirmation.
-- Safe to re-run: IF NOT EXISTS / DROP IF EXISTS.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS last_purchase_date date;

CREATE TABLE IF NOT EXISTS public.supplier_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT 'image',
  supplier_name text,
  invoice_number text,
  invoice_date date,
  currency text NOT NULL DEFAULT 'CHF',
  net_total numeric,
  vat_amount numeric,
  gross_total numeric,
  extraction_status text NOT NULL DEFAULT 'ausstehend',
  review_status text NOT NULL DEFAULT 'offen',
  included_in_costs boolean NOT NULL DEFAULT false,
  extraction_confidence text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplier_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  invoice_id uuid NOT NULL REFERENCES public.supplier_invoices(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  supplier_article_no text,
  manufacturer text,
  manufacturer_article_no text,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'Stk',
  unit_price numeric,
  discount numeric,
  net_total numeric,
  confidence text,
  match_kind text,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  matched_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  price_decision text,
  review_status text NOT NULL DEFAULT 'offen',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_name text,
  purchase_price numeric NOT NULL,
  invoice_date date,
  supplier_invoice_id uuid REFERENCES public.supplier_invoices(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_invoice_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_price_history TO authenticated;
GRANT ALL ON public.supplier_invoices TO service_role;
GRANT ALL ON public.supplier_invoice_items TO service_role;
GRANT ALL ON public.product_price_history TO service_role;

ALTER TABLE public.supplier_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_price_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own supplier invoices" ON public.supplier_invoices;
CREATE POLICY "own supplier invoices" ON public.supplier_invoices FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own invoice items" ON public.supplier_invoice_items;
CREATE POLICY "own invoice items" ON public.supplier_invoice_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "own price history" ON public.product_price_history;
CREATE POLICY "own price history" ON public.product_price_history FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS t_supplier_invoices ON public.supplier_invoices;
CREATE TRIGGER t_supplier_invoices BEFORE UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS tj_supplier_invoices ON public.supplier_invoices;
CREATE TRIGGER tj_supplier_invoices AFTER INSERT OR UPDATE OR DELETE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.touch_job();

-- One included-in-costs invoice per user + supplier + invoice number.
CREATE UNIQUE INDEX IF NOT EXISTS supplier_invoices_included_identity
  ON public.supplier_invoices (
    user_id,
    lower(regexp_replace(btrim(supplier_name), '\s+', ' ', 'g')),
    lower(regexp_replace(btrim(invoice_number), '\s+', ' ', 'g'))
  )
  WHERE included_in_costs = true
    AND supplier_name IS NOT NULL AND btrim(supplier_name) <> ''
    AND invoice_number IS NOT NULL AND btrim(invoice_number) <> '';
