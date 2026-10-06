-- Employee / technician master data on the per-user settings row.
-- Name, rates and vehicle fee already live on settings; these columns add contact, address and signature.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS technician_role text NOT NULL DEFAULT 'Monteur',
  ADD COLUMN IF NOT EXISTS technician_phone text,
  ADD COLUMN IF NOT EXISTS technician_email text,
  ADD COLUMN IF NOT EXISTS technician_street text,
  ADD COLUMN IF NOT EXISTS technician_zip text,
  ADD COLUMN IF NOT EXISTS technician_city text,
  ADD COLUMN IF NOT EXISTS technician_signature_path text;
