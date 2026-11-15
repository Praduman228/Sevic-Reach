ALTER TABLE public.campaign_firms DROP CONSTRAINT campaign_firms_status_chk;
ALTER TABLE public.campaign_firms ADD CONSTRAINT campaign_firms_status_chk CHECK (status IN ('pending','processing','scheduled','missing_contact','failed','low_fit'));
ALTER TABLE public.campaign_firms ADD COLUMN fit_score integer;