-- Project execution: actual hours against quoted labour_items, actual material qty.
-- Quoted labour_items.hours and material_requirements.quantity stay SOLL (Offerte).
ALTER TABLE public.material_requirements
  ADD COLUMN IF NOT EXISTS actual_quantity numeric;

CREATE TABLE IF NOT EXISTS public.labour_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  labour_item_id uuid NOT NULL REFERENCES public.labour_items(id) ON DELETE CASCADE,
  technician text,
  hours numeric NOT NULL DEFAULT 0,
  notes text,
  worked_on date,
  start_at timestamptz,
  end_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.labour_time_entries TO authenticated;
GRANT ALL ON public.labour_time_entries TO service_role;
ALTER TABLE public.labour_time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own time entries" ON public.labour_time_entries
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER tj_labour_time_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.labour_time_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_job();
