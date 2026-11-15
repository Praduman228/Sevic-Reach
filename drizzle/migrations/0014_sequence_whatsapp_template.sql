ALTER TABLE public.sequence_messages
  ADD COLUMN whatsapp_template text NOT NULL DEFAULT 'shegruhmessage';
COMMENT ON COLUMN public.sequence_messages.whatsapp_template IS 'Gupshup template used when sending this step outside the 24-hour window: shegruhmessage (intro) or outreach1 (follow-up)';