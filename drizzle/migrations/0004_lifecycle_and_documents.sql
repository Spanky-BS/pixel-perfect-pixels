-- Lifecycle (completed / cancelled) separate from workflow step.
-- Source documents (PDF, Excel, CSV, screenshots) belong to the job, not to products.
-- Safe to re-run: IF NOT EXISTS / DROP IF EXISTS.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

UPDATE public.jobs
SET
  lifecycle_status = 'completed',
  completed_at = COALESCE(completed_at, updated_at)
WHERE lifecycle_status = 'active'
  AND status IN ('Abgeschlossen', 'Verrechnet', 'Erledigt');

UPDATE public.material_requirements
SET status = 'Offen'
WHERE status = 'Produkt suchen';

CREATE TABLE IF NOT EXISTS public.job_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT 'Datei',
  mime_type text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_documents TO authenticated;
GRANT ALL ON public.job_documents TO service_role;
ALTER TABLE public.job_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own documents" ON public.job_documents;
CREATE POLICY "own documents" ON public.job_documents FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS tj_documents ON public.job_documents;
CREATE TRIGGER tj_documents AFTER INSERT OR UPDATE OR DELETE ON public.job_documents FOR EACH ROW EXECUTE FUNCTION public.touch_job();
