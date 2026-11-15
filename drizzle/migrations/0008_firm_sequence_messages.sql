CREATE TABLE public.sequence_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
  stage firm_stage NOT NULL,
  step integer NOT NULL,
  label text NOT NULL,
  offset_minutes integer NOT NULL DEFAULT 0,
  email_subject text NOT NULL DEFAULT '',
  email_body text NOT NULL DEFAULT '',
  whatsapp_body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  approved_at timestamptz,
  scheduled_at timestamptz,
  sent_at timestamptz,
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firm_id, stage, step)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sequence_messages TO authenticated;
GRANT ALL ON public.sequence_messages TO service_role;
ALTER TABLE public.sequence_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team all sequence messages" ON public.sequence_messages FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
CREATE INDEX sequence_messages_due ON public.sequence_messages (status, scheduled_at);