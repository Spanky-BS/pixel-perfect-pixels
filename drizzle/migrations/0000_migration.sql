
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  display_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE TABLE public.settings (
  user_id uuid PRIMARY KEY,
  company_name text NOT NULL DEFAULT 'Haustechnik Nordwestschweiz',
  currency text NOT NULL DEFAULT 'CHF',
  vat_rate numeric(5,2) NOT NULL DEFAULT 8.1,
  default_hourly_rate numeric(10,2) NOT NULL DEFAULT 120,
  default_material_markup numeric(5,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  company_name text, first_name text, last_name text,
  street text, zip text, city text, phone text, email text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own customers" ON public.customers FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  title text NOT NULL,
  street text, zip text, city text,
  status text NOT NULL DEFAULT 'Neu',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jobs TO authenticated;
GRANT ALL ON public.jobs TO service_role;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs" ON public.jobs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  description text, category text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_photos TO authenticated;
GRANT ALL ON public.job_photos TO service_role;
ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own photos" ON public.job_photos FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.voice_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'voice',
  storage_path text,
  duration_seconds numeric,
  transcript text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_notes TO authenticated;
GRANT ALL ON public.voice_notes TO service_role;
ALTER TABLE public.voice_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notes" ON public.voice_notes FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.material_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_categories TO authenticated;
GRANT ALL ON public.material_categories TO service_role;
ALTER TABLE public.material_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own categories" ON public.material_categories FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.material_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.material_categories(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 1,
  unit text NOT NULL DEFAULT 'Stk',
  preferred_brand text, dimensions text, finish text, notes text,
  status text NOT NULL DEFAULT 'Offen',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_requirements TO authenticated;
GRANT ALL ON public.material_requirements TO service_role;
ALTER TABLE public.material_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own materials" ON public.material_requirements FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.labour_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  hours numeric NOT NULL DEFAULT 1,
  hourly_rate numeric NOT NULL DEFAULT 120,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labour_items TO authenticated;
GRANT ALL ON public.labour_items TO service_role;
ALTER TABLE public.labour_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own labour" ON public.labour_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER t_customers BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_jobs BEFORE UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_notes BEFORE UPDATE ON public.voice_notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_mat BEFORE UPDATE ON public.material_requirements FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER t_lab BEFORE UPDATE ON public.labour_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.touch_job() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.jobs SET updated_at = now() WHERE id = COALESCE(NEW.job_id, OLD.job_id);
  RETURN NULL;
END; $$;
CREATE TRIGGER tj_photos AFTER INSERT OR UPDATE OR DELETE ON public.job_photos FOR EACH ROW EXECUTE FUNCTION public.touch_job();
CREATE TRIGGER tj_notes AFTER INSERT OR UPDATE OR DELETE ON public.voice_notes FOR EACH ROW EXECUTE FUNCTION public.touch_job();
CREATE TRIGGER tj_mat AFTER INSERT OR UPDATE OR DELETE ON public.material_requirements FOR EACH ROW EXECUTE FUNCTION public.touch_job();
CREATE TRIGGER tj_lab AFTER INSERT OR UPDATE OR DELETE ON public.labour_items FOR EACH ROW EXECUTE FUNCTION public.touch_job();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cats text[] := ARRAY['WC','Spülkasten','Betätigungsplatte','Waschtisch','Armaturen','Dusche','Badewanne','Siphon','Ventile','Boiler','Rohrsysteme','Fittings','Installation','Befestigungsmaterial','Kleinmaterial','Ersatzteile','Sonstiges'];
i int;
BEGIN
  INSERT INTO public.profiles(id, email, display_name) VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.settings(user_id) VALUES (NEW.id);
  FOR i IN 1..array_length(cats,1) LOOP
    INSERT INTO public.material_categories(user_id, name, sort_order) VALUES (NEW.id, cats[i], i);
  END LOOP;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "own media read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'job-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own media insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'job-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own media delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'job-media' AND (storage.foldername(name))[1] = auth.uid()::text);
