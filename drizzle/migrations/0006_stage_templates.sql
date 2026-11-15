CREATE TABLE public.stage_templates (
  stage public.firm_stage PRIMARY KEY,
  email_subject text NOT NULL DEFAULT '',
  email_body text NOT NULL DEFAULT '',
  whatsapp_body text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_templates TO authenticated;
GRANT ALL ON public.stage_templates TO service_role;
ALTER TABLE public.stage_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team all stage templates" ON public.stage_templates FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));