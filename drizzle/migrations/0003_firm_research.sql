CREATE TABLE public.firm_research (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  brief jsonb NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX firm_research_firm_idx ON public.firm_research(firm_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.firm_research TO authenticated;
GRANT ALL ON public.firm_research TO service_role;
ALTER TABLE public.firm_research ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads research" ON public.firm_research FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team writes research" ON public.firm_research FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "team deletes research" ON public.firm_research FOR DELETE TO authenticated USING (public.is_team_member(auth.uid()));