ALTER TABLE public.labour_items ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.material_requirements ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS offer_text_rows jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.labour_items ADD CONSTRAINT labour_items_discount_range CHECK (discount >= 0 AND discount <= 100);
ALTER TABLE public.material_requirements ADD CONSTRAINT material_requirements_discount_range CHECK (discount >= 0 AND discount <= 100);