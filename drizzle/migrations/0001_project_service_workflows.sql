ALTER TABLE public.jobs
  ADD COLUMN job_type text NOT NULL DEFAULT 'project',
  ADD COLUMN appointment_at timestamptz,
  ADD COLUMN problem_description text,
  ADD COLUMN customer_request text,
  ADD COLUMN internal_notes text,
  ADD COLUMN completion_notes text,
  ADD COLUMN work_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN signature_path text,
  ADD COLUMN completed_at timestamptz;

ALTER TABLE public.settings
  ADD COLUMN estimate_tolerance numeric NOT NULL DEFAULT 20,
  ADD COLUMN service_hourly_rate numeric NOT NULL DEFAULT 120,
  ADD COLUMN travel_rate numeric NOT NULL DEFAULT 120,
  ADD COLUMN vehicle_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN small_material_allowance numeric NOT NULL DEFAULT 0;

ALTER TABLE public.material_requirements
  ADD COLUMN confidence text,
  ADD COLUMN source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.labour_items
  ADD COLUMN confidence text,
  ADD COLUMN source text NOT NULL DEFAULT 'manual';

CREATE TABLE public.open_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  text text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'offen',
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence text,
  state text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cost_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  tolerance numeric NOT NULL DEFAULT 20,
  confidence text NOT NULL DEFAULT 'mittel',
  visibility text NOT NULL DEFAULT 'intern',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cost_estimate_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  estimate_id uuid NOT NULL REFERENCES public.cost_estimates(id) ON DELETE CASCADE,
  section text NOT NULL DEFAULT 'Sonstiges',
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.service_labour_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  technician text,
  start_at timestamptz,
  end_at timestamptz,
  hours numeric NOT NULL DEFAULT 1,
  hourly_rate numeric NOT NULL DEFAULT 120,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.service_material_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'Stk',
  purchase_price numeric,
  sales_price numeric NOT NULL DEFAULT 0,
  supplier text,
  supplier_article_no text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.service_additional_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'Sonstiges',
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Future phase (supplier/Bexio): structure only, no integration yet
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  preferred boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 0,
  connection_status text NOT NULL DEFAULT 'nicht verbunden',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE CASCADE,
  supplier_article_no text, manufacturer text, manufacturer_article_no text,
  name text, image_url text, purchase_price numeric, stock numeric, delivery_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.selected_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  material_id uuid REFERENCES public.material_requirements(id) ON DELETE CASCADE,
  supplier_product_id uuid REFERENCES public.supplier_products(id) ON DELETE SET NULL,
  is_preferred boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'Entwurf',
  total numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bexio_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  entity text NOT NULL, entity_id uuid NOT NULL, bexio_id text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['open_questions','ai_suggestions','cost_estimates','cost_estimate_items','service_labour_entries','service_material_entries','service_additional_costs','suppliers','supplier_products','selected_products','quotations','bexio_sync'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "own rows" ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['open_questions','service_labour_entries','service_material_entries','service_additional_costs','cost_estimates'] LOOP
    EXECUTE format('CREATE TRIGGER tj_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_job()', t, t);
  END LOOP;
END $$;

CREATE TRIGGER t_oq BEFORE UPDATE ON public.open_questions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_ce BEFORE UPDATE ON public.cost_estimates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();