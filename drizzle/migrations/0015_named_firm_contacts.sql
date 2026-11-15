CREATE TABLE public.firm_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
 name text NOT NULL DEFAULT '', email text, phone text, created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT contact_has_address CHECK (email IS NOT NULL OR phone IS NOT NULL),
 CONSTRAINT contact_name_length CHECK (char_length(name) <= 120),
 CONSTRAINT contact_email_valid CHECK (email IS NULL OR (char_length(email) <= 254 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
 CONSTRAINT contact_phone_valid CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$')
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firm_contacts TO authenticated;
GRANT ALL ON public.firm_contacts TO service_role;
ALTER TABLE public.firm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team manages contacts" ON public.firm_contacts FOR ALL TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
CREATE INDEX firm_contacts_firm_idx ON public.firm_contacts(firm_id);
ALTER TABLE public.sequence_messages ADD COLUMN email_contact_ids uuid[], ADD COLUMN whatsapp_contact_ids uuid[];
CREATE TABLE public.sequence_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sequence_id uuid NOT NULL REFERENCES public.sequence_messages(id) ON DELETE CASCADE,
 channel text NOT NULL CHECK (channel IN ('email','whatsapp')), address text NOT NULL, contact_name text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'sending', provider_message_id text, error text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sequence_id, channel, address)
);
GRANT SELECT, INSERT, UPDATE ON public.sequence_deliveries TO authenticated;
GRANT ALL ON public.sequence_deliveries TO service_role;
ALTER TABLE public.sequence_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads deliveries" ON public.sequence_deliveries FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team inserts deliveries" ON public.sequence_deliveries FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()));
CREATE POLICY "team updates deliveries" ON public.sequence_deliveries FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));