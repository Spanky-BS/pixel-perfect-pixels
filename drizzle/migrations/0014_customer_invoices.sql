ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS invoice_payment_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS akonto_payment_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS offer_valid_days integer NOT NULL DEFAULT 30;

CREATE TABLE IF NOT EXISTS public.customer_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'schluss' CHECK (kind IN ('akonto','schluss')),
  number text NOT NULL,
  invoice_date date NOT NULL DEFAULT current_date,
  due_date date NOT NULL,
  title text NOT NULL DEFAULT '',
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  net numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 8.1,
  vat numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  akonto_deducted numeric NOT NULL DEFAULT 0,
  amount_due numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','bezahlt','storniert')),
  paid_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_invoices TO authenticated;
GRANT ALL ON public.customer_invoices TO service_role;
ALTER TABLE public.customer_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON public.customer_invoices FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS customer_invoices_job_idx ON public.customer_invoices(job_id);
CREATE TRIGGER tj_customer_invoices AFTER INSERT OR UPDATE OR DELETE ON public.customer_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_job();