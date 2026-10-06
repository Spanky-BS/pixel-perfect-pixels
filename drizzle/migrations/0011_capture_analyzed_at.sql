ALTER TABLE public.voice_notes ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;
ALTER TABLE public.job_photos ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;
ALTER TABLE public.job_documents ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;