ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS offer_discount_percent numeric NOT NULL DEFAULT 0;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_offer_discount_percent_range CHECK (offer_discount_percent >= 0 AND offer_discount_percent <= 100);
COMMENT ON COLUMN public.jobs.offer_discount_percent IS 'Single quote-level discount percentage, shown before VAT and the final total.';
COMMENT ON COLUMN public.labour_items.discount IS 'DEPRECATED: replaced by jobs.offer_discount_percent; retained for historical data only.';
COMMENT ON COLUMN public.material_requirements.discount IS 'DEPRECATED: replaced by jobs.offer_discount_percent; retained for historical data only.';