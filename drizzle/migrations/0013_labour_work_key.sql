-- Stable professional category for an Analyse task. Null means unassigned, not Unvorhergesehenes.
ALTER TABLE public.labour_items
  ADD COLUMN IF NOT EXISTS work_key text;

CREATE INDEX IF NOT EXISTS labour_items_work_key_idx ON public.labour_items(job_id, work_key);
