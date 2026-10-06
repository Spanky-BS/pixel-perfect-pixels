-- Persistent sequential Regierapport numbers: RR-YYYY-MM-XX (per user, per calendar month).
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS report_number text,
  ADD COLUMN IF NOT EXISTS report_created_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_user_report_number_uidx
  ON public.jobs (user_id, report_number)
  WHERE report_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.service_report_counters (
  user_id uuid NOT NULL,
  year integer NOT NULL,
  month integer NOT NULL,
  last_seq integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, year, month)
);
GRANT SELECT, INSERT, UPDATE ON public.service_report_counters TO authenticated;
GRANT ALL ON public.service_report_counters TO service_role;
ALTER TABLE public.service_report_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own report counters" ON public.service_report_counters;
CREATE POLICY "own report counters" ON public.service_report_counters
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.assign_service_report_number(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  j public.jobs%ROWTYPE;
  y integer;
  mo integer;
  seq integer;
  num text;
  created timestamptz := now();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  SELECT * INTO j FROM public.jobs WHERE id = p_job_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auftrag nicht gefunden';
  END IF;
  IF j.job_type IS DISTINCT FROM 'service' THEN
    RAISE EXCEPTION 'Nur für Regie / Service';
  END IF;
  IF j.report_number IS NOT NULL THEN
    RETURN j.report_number;
  END IF;

  y := EXTRACT(YEAR FROM created)::integer;
  mo := EXTRACT(MONTH FROM created)::integer;

  INSERT INTO public.service_report_counters (user_id, year, month, last_seq)
  VALUES (uid, y, mo, 0)
  ON CONFLICT (user_id, year, month) DO NOTHING;

  UPDATE public.service_report_counters
  SET last_seq = last_seq + 1
  WHERE user_id = uid AND year = y AND month = mo
  RETURNING last_seq INTO seq;

  num := 'RR-' || y::text || '-' || lpad(mo::text, 2, '0') || '-' || lpad(seq::text, 2, '0');

  UPDATE public.jobs
  SET report_number = num, report_created_at = created
  WHERE id = p_job_id AND user_id = uid AND report_number IS NULL;

  SELECT report_number INTO num FROM public.jobs WHERE id = p_job_id AND user_id = uid;
  RETURN num;
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_service_report_number(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.assign_service_report_number(uuid) FROM public;
