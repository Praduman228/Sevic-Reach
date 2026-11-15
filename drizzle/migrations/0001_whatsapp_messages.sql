CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.firms(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('out','in')),
  phone text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  provider_message_id text UNIQUE,
  error text,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.whatsapp_messages (firm_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads messages" ON public.whatsapp_messages FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team writes messages" ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()) AND sent_by = auth.uid());
CREATE POLICY "team updates messages" ON public.whatsapp_messages FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));