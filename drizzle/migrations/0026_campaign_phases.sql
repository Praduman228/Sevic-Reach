ALTER TABLE public.campaign_firms ADD COLUMN phase text NOT NULL DEFAULT 'research';
ALTER TABLE public.campaigns ADD COLUMN pause_reason text;