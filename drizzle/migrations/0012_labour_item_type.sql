-- Offerte grouping: commercial sections vs internal analysis tasks.
-- Existing rows stay compatible (item_type defaults to section).
ALTER TABLE public.labour_items
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.labour_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'section';

ALTER TABLE public.labour_items
  DROP CONSTRAINT IF EXISTS labour_items_item_type_check;
ALTER TABLE public.labour_items
  ADD CONSTRAINT labour_items_item_type_check CHECK (item_type IN ('task', 'section'));

CREATE INDEX IF NOT EXISTS labour_items_parent_id_idx ON public.labour_items(parent_id);
CREATE INDEX IF NOT EXISTS labour_items_item_type_idx ON public.labour_items(job_id, item_type);
