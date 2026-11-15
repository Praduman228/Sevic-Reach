CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  motto text NOT NULL DEFAULT '',
  channels text[] NOT NULL DEFAULT ARRAY['email','whatsapp'],
  status text NOT NULL DEFAULT 'draft',
  created_by uuid,
  launched_at timestamptz,
  completed_at timestamptz,
  last_run_at timestamptz,
  lock_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_status_chk CHECK (status IN ('draft','running','paused','completed')),
  CONSTRAINT campaigns_channels_chk CHECK (channels <@ ARRAY['email','whatsapp'] AND cardinality(channels) > 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team manages campaigns" ON public.campaigns FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));

CREATE TABLE public.campaign_firms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  is_test boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  missing text[] NOT NULL DEFAULT '{}',
  error text,
  attempts integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, firm_id),
  CONSTRAINT campaign_firms_status_chk CHECK (status IN ('pending','processing','scheduled','missing_contact','failed'))
);
CREATE INDEX campaign_firms_campaign_status_idx ON public.campaign_firms (campaign_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_firms TO authenticated;
GRANT ALL ON public.campaign_firms TO service_role;
ALTER TABLE public.campaign_firms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team manages campaign firms" ON public.campaign_firms FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));