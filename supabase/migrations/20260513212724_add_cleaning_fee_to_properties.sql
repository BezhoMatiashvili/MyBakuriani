ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS cleaning_fee NUMERIC(10,2);
COMMENT ON COLUMN public.properties.cleaning_fee IS 'One-time cleaning fee added to the booking total. NULL or 0 means no fee.';
