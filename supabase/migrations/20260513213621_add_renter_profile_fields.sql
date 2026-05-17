ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_type TEXT,
  ADD COLUMN IF NOT EXISTS personal_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.profile_type IS 'personal | company';
COMMENT ON COLUMN public.profiles.personal_id IS 'Personal/company tax ID';
COMMENT ON COLUMN public.profiles.whatsapp_enabled IS 'Allow WhatsApp inquiries on listings';
COMMENT ON COLUMN public.profiles.notification_prefs IS 'JSON map: new_request, add_favorite, monthly_report → bool';
