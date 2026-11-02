ALTER TABLE public.labour_items ADD COLUMN IF NOT EXISTS rubric text;
ALTER TABLE public.material_requirements ADD COLUMN IF NOT EXISTS rubric text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS offer_rubric_texts jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS offer_exclusions jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS offer_pricing_mode text NOT NULL DEFAULT 'rubric';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS offer_exclusions jsonb NOT NULL DEFAULT '["Maurer-, Plattenleger- und Malerarbeiten sind nicht enthalten.","Elektroarbeiten und elektrische Zuleitungen sind nicht enthalten (bauseits).","Verdeckte Schäden oder unbekannte Leitungsverhältnisse sind nicht berücksichtigt.","Arbeiten ausserhalb des beschriebenen Leistungsumfangs werden nach Aufwand verrechnet.","Bewilligungen und Planungsleistungen sind nur enthalten, wenn ausdrücklich erwähnt."]'::jsonb;