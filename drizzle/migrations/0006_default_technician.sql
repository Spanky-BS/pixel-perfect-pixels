-- Configurable default technician for labour entries (Regie).
-- travel_rate / vehicle_fee stay in settings; vehicle_fee is the canonical Fahrzeugpauschale.
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS default_technician text NOT NULL DEFAULT 'Timo Simonato';
