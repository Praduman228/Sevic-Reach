CREATE TABLE public.firm_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT 'primary',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.firm_list_members (
  list_id uuid NOT NULL REFERENCES public.firm_lists(id) ON DELETE CASCADE,
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, firm_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_list_members TO authenticated;
GRANT ALL ON public.firm_lists TO service_role;
GRANT ALL ON public.firm_list_members TO service_role;
ALTER TABLE public.firm_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_list_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team all lists" ON public.firm_lists FOR ALL TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "team all list members" ON public.firm_list_members FOR ALL TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));