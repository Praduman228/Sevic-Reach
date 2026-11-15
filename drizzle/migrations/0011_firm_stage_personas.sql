CREATE TABLE public.firm_personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  stage public.firm_stage NOT NULL,
  persona text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, stage)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_personas TO authenticated;
GRANT ALL ON public.firm_personas TO service_role;
ALTER TABLE public.firm_personas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team all personas" ON public.firm_personas FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
INSERT INTO public.firm_personas (firm_id, stage, persona)
  SELECT id, 'discovery', persona FROM public.firms WHERE coalesce(trim(persona), '') <> ''
  ON CONFLICT DO NOTHING;
COMMENT ON COLUMN public.firms.persona IS 'DEPRECATED: replaced by firm_personas (per stage)';