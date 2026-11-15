-- Sevic Reach - Complete Database Schema
-- Run this script in your Supabase Dashboard -> SQL Editor

-- ==========================================
-- Migration: 0000_migration.sql
-- ==========================================

create type public.app_role as enum ('admin','sales');
create type public.firm_stage as enum ('outreach','discovery','demo','pilot','paid','customer','nurture','lost');
create type public.firm_source as enum ('linkedin','email','referral','event');

create table public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
create or replace function public.is_team_member(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id)
$$;

create policy "team reads profiles" on public.profiles for select to authenticated using (public.is_team_member(auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());
create policy "read own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'sales');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  team_size int,
  contact_name text,
  phone text,
  email text,
  source firm_source not null default 'linkedin',
  stage firm_stage not null default 'outreach',
  stage_entered_at timestamptz not null default now(),
  whatsapp_opt_in boolean not null default false,
  whatsapp_opt_in_at timestamptz,
  owner_id uuid,
  notes text,
  lost_reason text,
  reached_discovery_at timestamptz,
  reached_demo_at timestamptz,
  reached_pilot_at timestamptz,
  reached_paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.firms to authenticated;
grant all on public.firms to service_role;
alter table public.firms enable row level security;
create policy "team reads firms" on public.firms for select to authenticated using (public.is_team_member(auth.uid()));
create policy "team inserts firms" on public.firms for insert to authenticated with check (public.is_team_member(auth.uid()));
create policy "team updates firms" on public.firms for update to authenticated using (public.is_team_member(auth.uid()));
create policy "admin deletes firms" on public.firms for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  title text not null,
  stage firm_stage,
  due_at timestamptz not null,
  completed_at timestamptz,
  auto boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.tasks(due_at) where completed_at is null;
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create policy "team all tasks" on public.tasks for all to authenticated using (public.is_team_member(auth.uid())) with check (public.is_team_member(auth.uid()));

create table public.firm_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  kind text not null,
  detail text,
  created_at timestamptz not null default now()
);
grant select, insert on public.firm_events to authenticated;
grant all on public.firm_events to service_role;
alter table public.firm_events enable row level security;
create policy "team reads events" on public.firm_events for select to authenticated using (public.is_team_member(auth.uid()));
create policy "team inserts events" on public.firm_events for insert to authenticated with check (public.is_team_member(auth.uid()));

-- validation + stage bookkeeping
create or replace function public.firms_before_write()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.stage = 'lost' and coalesce(trim(new.lost_reason),'') = '' then
    raise exception 'Lost reason is required';
  end if;
  if new.phone is not null and new.phone <> '' and new.phone !~ '^\+[1-9][0-9]{7,14}$' then
    raise exception 'Phone must be in E.164 format, e.g. +919876543210';
  end if;
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    new.stage_entered_at := now();
  end if;
  if new.whatsapp_opt_in and new.whatsapp_opt_in_at is null then new.whatsapp_opt_in_at := now(); end if;
  if new.stage in ('discovery','demo','pilot','paid','customer') and new.reached_discovery_at is null then new.reached_discovery_at := new.stage_entered_at; end if;
  if new.stage in ('demo','pilot','paid','customer') and new.reached_demo_at is null then new.reached_demo_at := new.stage_entered_at; end if;
  if new.stage in ('pilot','paid','customer') and new.reached_pilot_at is null then new.reached_pilot_at := new.stage_entered_at; end if;
  if new.stage in ('paid','customer') and new.reached_paid_at is null then new.reached_paid_at := new.stage_entered_at; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger firms_bw before insert or update on public.firms for each row execute function public.firms_before_write();

create or replace function public.firms_after_stage()
returns trigger language plpgsql security definer set search_path = public as $$
declare t timestamptz := new.stage_entered_at;
begin
  if tg_op = 'UPDATE' and new.stage is not distinct from old.stage then return new; end if;
  delete from public.tasks where firm_id = new.id and auto and completed_at is null;
  if tg_op = 'UPDATE' then
    insert into public.firm_events(firm_id, kind, detail) values (new.id, 'stage', old.stage || ' → ' || new.stage);
  end if;
  insert into public.tasks(firm_id, title, stage, due_at)
  select new.id, x.title, new.stage, t + x.off from (values
    ('discovery'::firm_stage, 'Send recap + demo invite', interval '0'),
    ('discovery', 'Nudge #1 (day 2)', interval '2 days'),
    ('discovery', 'Nudge #2 (day 5)', interval '5 days'),
    ('discovery', 'Nudge #3 (day 10)', interval '10 days'),
    ('discovery', 'No reply by day 21 → move to Nurture', interval '21 days'),
    ('demo', 'Send pilot proposal', interval '0'),
    ('demo', 'Touch #1 (day 1)', interval '1 day'),
    ('demo', 'Touch #2 (day 3)', interval '3 days'),
    ('demo', 'Touch #3 (day 7)', interval '7 days'),
    ('demo', 'No decision by day 14 → move to Nurture', interval '14 days'),
    ('pilot', 'Welcome message (hour 1)', interval '1 hour'),
    ('pilot', 'Activation check (day 1)', interval '1 day'),
    ('pilot', 'Activation check (day 3)', interval '3 days'),
    ('pilot', 'Activation check (day 5)', interval '5 days'),
    ('pilot', 'Send convert offer (day 10)', interval '10 days'),
    ('nurture', 'Re-engage (day 30)', interval '30 days'),
    ('nurture', 'Re-engage (day 60)', interval '60 days'),
    ('nurture', 'Re-engage (day 90)', interval '90 days'),
    ('nurture', 'Silent after day 90 → mark Lost', interval '91 days'),
    ('customer', 'Day 60 check-in', interval '60 days'),
    ('customer', 'Day 90 review', interval '90 days'),
    ('customer', 'Month 11 renewal conversation', interval '330 days')
  ) as x(stg, title, off) where x.stg = new.stage;
  return new;
end $$;
create trigger firms_as after insert or update of stage on public.firms for each row execute function public.firms_after_stage();

-- seed
insert into public.firms (name, city, team_size, contact_name, phone, email, source, stage, stage_entered_at, whatsapp_opt_in, notes, lost_reason, reached_discovery_at, reached_demo_at, reached_pilot_at, reached_paid_at) values
('Studio Lotus', 'New Delhi', 45, 'Ankur Choksi', '+919810000001', 'ankur@studiolotus.in', 'linkedin', 'outreach', now() - interval '3 days', false, null, null, null, null, null, null),
('Morphogenesis', 'Noida', 120, 'Sonali Rastogi', '+919810000002', 'sonali@morphogenesis.org', 'event', 'outreach', now() - interval '6 days', false, null, null, null, null, null, null),
('Sanjay Puri Architects', 'Mumbai', 60, 'Sanjay Puri', '+919820000003', 'sp@sanjaypuri.in', 'linkedin', 'outreach', now() - interval '1 day', false, null, null, null, null, null, null),
('Abin Design Studio', 'Kolkata', 18, 'Abin Chaudhuri', '+919830000004', 'abin@abindesign.in', 'email', 'outreach', now() - interval '9 days', false, null, null, null, null, null, null),
('Mancini Design', 'Bengaluru', 30, 'Ravi Mancini', '+919880000005', 'ravi@mancini.in', 'linkedin', 'outreach', now() - interval '2 days', false, null, null, null, null, null, null),
('Spasm Design', 'Mumbai', 25, 'Sanjeev Panjabi', '+919820000006', 'sanjeev@spasm.in', 'referral', 'outreach', now() - interval '12 days', false, null, null, null, null, null, null),
('Khosla Associates', 'Bengaluru', 35, 'Sandeep Khosla', '+919880000007', 'sandeep@khosla.in', 'linkedin', 'outreach', now() - interval '4 days', false, null, null, null, null, null, null),
('Matharoo Associates', 'Ahmedabad', 22, 'Gurjit Matharoo', '+919825000008', 'gm@matharoo.in', 'event', 'outreach', now() - interval '7 days', false, null, null, null, null, null, null),
('RMA Architects', 'Mumbai', 28, 'Rahul Mehrotra', '+919820000009', 'rahul@rmaarchitects.com', 'linkedin', 'discovery', now() - interval '3 days', true, 'Interested in drawing management', null, now() - interval '3 days', null, null, null),
('Studio Mumbai', 'Mumbai', 40, 'Bijoy Jain', '+919820000010', 'bijoy@studiomumbai.com', 'referral', 'discovery', now() - interval '11 days', true, null, null, now() - interval '11 days', null, null, null),
('Architecture BRIO', 'Mumbai', 15, 'Shefali Balwani', '+919820000011', 'shefali@brio.in', 'email', 'discovery', now() - interval '1 day', false, null, null, now() - interval '1 day', null, null, null),
('Chitra Vishwanath', 'Bengaluru', 20, 'Chitra Vishwanath', '+919880000012', 'chitra@chitra.in', 'linkedin', 'demo', now() - interval '2 days', true, 'Demo went well, wants pricing', null, now() - interval '12 days', now() - interval '2 days', null, null),
('Sameep Padora & Associates', 'Mumbai', 32, 'Sameep Padora', '+919820000013', 'sameep@sp-a.in', 'event', 'demo', now() - interval '8 days', true, null, null, now() - interval '20 days', now() - interval '8 days', null, null),
('Vir.Mueller Architects', 'New Delhi', 26, 'Pradeep Mueller', '+919810000014', 'pm@virmueller.com', 'linkedin', 'pilot', now() - interval '4 days', true, 'Pilot with 6 seats', null, now() - interval '25 days', now() - interval '15 days', now() - interval '4 days', null),
('Studio Saar', 'Pune', 12, 'Neha Saar', '+919890000015', 'neha@studiosaar.in', 'referral', 'pilot', now() - interval '9 days', true, null, null, now() - interval '30 days', now() - interval '20 days', now() - interval '9 days', null),
('Collective Project', 'Mumbai', 14, 'Sharmila Rao', '+919820000016', 'sharmila@collective.in', 'email', 'paid', now() - interval '10 days', true, 'Annual plan', null, now() - interval '50 days', now() - interval '40 days', now() - interval '25 days', now() - interval '10 days'),
('Malik Architecture', 'Mumbai', 38, 'Arjun Malik', '+919820000017', 'arjun@malik.in', 'linkedin', 'customer', now() - interval '70 days', true, null, null, now() - interval '130 days', now() - interval '115 days', now() - interval '100 days', now() - interval '80 days'),
('DCOOP Architects', 'Hyderabad', 16, 'Kanika Dhand', '+919840000018', 'kanika@dcoop.in', 'event', 'nurture', now() - interval '35 days', true, 'Budget next quarter', null, now() - interval '70 days', null, null, null),
('Anagram Architects', 'New Delhi', 20, 'Vaibhav Dimri', '+919810000019', 'vaibhav@anagram.in', 'linkedin', 'lost', now() - interval '15 days', false, null, 'Chose a competitor', now() - interval '40 days', now() - interval '30 days', null, null),
('Shroffleón', 'Mumbai', 24, 'Kalpit Ashar', '+919820000020', 'kalpit@shroffleon.com', 'email', 'outreach', now() - interval '5 days', false, null, null, null, null, null, null);

-- ==========================================
-- Migration: 0001_whatsapp_messages.sql
-- ==========================================

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

-- ==========================================
-- Migration: 0002_0002_email_messages.sql
-- ==========================================

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firm_id uuid REFERENCES public.firms(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('out','in')),
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  provider_message_id text,
  error text,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.email_messages (firm_id, created_at);
GRANT SELECT, INSERT, UPDATE ON public.email_messages TO authenticated;
GRANT ALL ON public.email_messages TO service_role;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team reads emails" ON public.email_messages FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY "team writes emails" ON public.email_messages FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid()) AND sent_by = auth.uid());
CREATE POLICY "team updates emails" ON public.email_messages FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid()));

-- ==========================================
-- Migration: 0003_firm_research.sql
-- ==========================================

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

-- ==========================================
-- Migration: 0004_add_firms_state.sql
-- ==========================================

-- Add a state column so leads can be classified state-wise alongside city.
ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS state text;

COMMENT ON COLUMN public.firms.state IS 'Indian state / union territory — used for state-wise classification filters';

-- Backfill 1: state captured in the imported notes ("State: Maharashtra").
UPDATE public.firms
SET state = NULLIF(BTRIM(SUBSTRING(notes FROM 'State:[ \t]*([^\r\n]+)')), '')
WHERE state IS NULL AND notes IS NOT NULL AND notes LIKE '%State:%';

-- Backfill 2: derive state from a known city where the sheet had no state.
UPDATE public.firms
SET state = CASE BTRIM(city)
  WHEN 'Mumbai' THEN 'Maharashtra'
  WHEN 'Pune' THEN 'Maharashtra'
  WHEN 'Nagpur' THEN 'Maharashtra'
  WHEN 'Thane' THEN 'Maharashtra'
  WHEN 'Bengaluru' THEN 'Karnataka'
  WHEN 'Udupi' THEN 'Karnataka'
  WHEN 'Delhi' THEN 'Delhi'
  WHEN 'New Delhi' THEN 'Delhi'
  WHEN 'Delhi NCR' THEN 'Delhi'
  WHEN 'Hyderabad' THEN 'Telangana'
  WHEN 'Chennai' THEN 'Tamil Nadu'
  WHEN 'Coimbatore' THEN 'Tamil Nadu'
  WHEN 'Raipur' THEN 'Chhattisgarh'
  WHEN 'Gurugram' THEN 'Haryana'
  WHEN 'Faridabad' THEN 'Haryana'
  WHEN 'Karnal' THEN 'Haryana'
  WHEN 'Noida' THEN 'Uttar Pradesh'
  WHEN 'Lucknow' THEN 'Uttar Pradesh'
  WHEN 'Muzaffarnagar' THEN 'Uttar Pradesh'
  WHEN 'Kolkata' THEN 'West Bengal'
  WHEN 'Jaipur' THEN 'Rajasthan'
  WHEN 'Kota' THEN 'Rajasthan'
  WHEN 'Vadodara' THEN 'Gujarat'
  WHEN 'Ahmedabad' THEN 'Gujarat'
  WHEN 'Surat' THEN 'Gujarat'
  WHEN 'Rajkot' THEN 'Gujarat'
  WHEN 'Chandigarh' THEN 'Chandigarh'
  WHEN 'Bhopal' THEN 'Madhya Pradesh'
  WHEN 'Indore' THEN 'Madhya Pradesh'
  WHEN 'Patna' THEN 'Bihar'
  WHEN 'Chatra' THEN 'Jharkhand'
  WHEN 'Goa' THEN 'Goa'
  WHEN 'Bhubaneswar' THEN 'Odisha'
  WHEN 'Vijayawada' THEN 'Andhra Pradesh'
  WHEN 'Kochi' THEN 'Kerala'
  WHEN 'Perintalmanna' THEN 'Kerala'
  ELSE NULL
END
WHERE state IS NULL AND city IS NOT NULL;

CREATE INDEX IF NOT EXISTS firms_state_idx ON public.firms (state);
CREATE INDEX IF NOT EXISTS firms_city_idx ON public.firms (city);

-- ==========================================
-- Migration: 0005_custom_lists.sql
-- ==========================================

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

-- ==========================================
-- Migration: 0006_stage_templates.sql
-- ==========================================

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

-- ==========================================
-- Migration: 0007_message_stage_and_replies.sql
-- ==========================================

ALTER TABLE public.email_messages ADD COLUMN IF NOT EXISTS stage public.firm_stage, ADD COLUMN IF NOT EXISTS from_email text;
ALTER TABLE public.whatsapp_messages ADD COLUMN IF NOT EXISTS stage public.firm_stage;
CREATE UNIQUE INDEX IF NOT EXISTS email_messages_provider_id_key ON public.email_messages(provider_message_id);

CREATE OR REPLACE FUNCTION public.message_set_stage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.stage IS NULL AND NEW.firm_id IS NOT NULL THEN
    SELECT stage INTO NEW.stage FROM public.firms WHERE id = NEW.firm_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS email_set_stage ON public.email_messages;
CREATE TRIGGER email_set_stage BEFORE INSERT ON public.email_messages FOR EACH ROW EXECUTE FUNCTION public.message_set_stage();
DROP TRIGGER IF EXISTS wa_set_stage ON public.whatsapp_messages;
CREATE TRIGGER wa_set_stage BEFORE INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.message_set_stage();

UPDATE public.email_messages m SET stage = f.stage FROM public.firms f WHERE m.firm_id = f.id AND m.stage IS NULL;
UPDATE public.whatsapp_messages m SET stage = f.stage FROM public.firms f WHERE m.firm_id = f.id AND m.stage IS NULL;

-- ==========================================
-- Migration: 0008_firm_sequence_messages.sql
-- ==========================================

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

-- ==========================================
-- Migration: 0009_enable_cron.sql
-- ==========================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ==========================================
-- Migration: 0010_firm_persona.sql
-- ==========================================

ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS persona text;

-- ==========================================
-- Migration: 0011_firm_stage_personas.sql
-- ==========================================

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

-- ==========================================
-- Migration: 0012_firm_lead_status.sql
-- ==========================================

CREATE TYPE public.lead_status AS ENUM ('hot', 'cold', 'junk');
ALTER TABLE public.firms ADD COLUMN lead_status public.lead_status;
COMMENT ON COLUMN public.firms.lead_status IS 'Lead qualification independent of sales stage; NULL means not classified yet.';

-- ==========================================
-- Migration: 0013_sequence_channel_status.sql
-- ==========================================

ALTER TABLE public.sequence_messages
  ADD COLUMN email_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN whatsapp_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN email_sent_at timestamptz,
  ADD COLUMN whatsapp_sent_at timestamptz;
UPDATE public.sequence_messages SET
  email_status = CASE WHEN status = 'sending' THEN 'approved' WHEN status = 'sent' THEN CASE WHEN coalesce(result,'') LIKE '%Email sent%' THEN 'sent' ELSE 'skipped' END ELSE status END,
  whatsapp_status = CASE WHEN status = 'sending' THEN 'approved' WHEN status = 'sent' THEN CASE WHEN coalesce(result,'') LIKE '%WhatsApp sent%' THEN 'sent' ELSE 'skipped' END ELSE status END,
  email_sent_at = CASE WHEN status = 'sent' AND coalesce(result,'') LIKE '%Email sent%' THEN sent_at END,
  whatsapp_sent_at = CASE WHEN status = 'sent' AND coalesce(result,'') LIKE '%WhatsApp sent%' THEN sent_at END;
COMMENT ON COLUMN public.sequence_messages.status IS 'Summary of email_status/whatsapp_status, kept for compatibility';
CREATE INDEX sequence_messages_email_due ON public.sequence_messages (email_status, scheduled_at);
CREATE INDEX sequence_messages_whatsapp_due ON public.sequence_messages (whatsapp_status, scheduled_at);

-- ==========================================
-- Migration: 0014_sequence_whatsapp_template.sql
-- ==========================================

ALTER TABLE public.sequence_messages
  ADD COLUMN whatsapp_template text NOT NULL DEFAULT 'shegruhmessage';
COMMENT ON COLUMN public.sequence_messages.whatsapp_template IS 'Gupshup template used when sending this step outside the 24-hour window: shegruhmessage (intro) or outreach1 (follow-up)';

-- ==========================================
-- Migration: 0015_named_firm_contacts.sql
-- ==========================================

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

-- ==========================================
-- Migration: 0016_add_contact_designation.sql
-- ==========================================

ALTER TABLE public.firm_contacts ADD COLUMN designation text;
COMMENT ON COLUMN public.firm_contacts.designation IS 'Job title of the named contact, e.g. Principal Architect';

-- ==========================================
-- Migration: 0017_independent_contact_sequences.sql
-- ==========================================

CREATE TABLE public.contact_sequence_messages (LIKE public.sequence_messages INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE public.contact_sequence_messages ADD PRIMARY KEY (id), ADD COLUMN contact_id uuid REFERENCES public.firm_contacts(id) ON DELETE SET NULL, ADD CONSTRAINT contact_sequence_firm_fk FOREIGN KEY (firm_id) REFERENCES public.firms(id) ON DELETE CASCADE, ADD CONSTRAINT contact_sequence_step_unique UNIQUE (firm_id, stage, contact_id, step);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_sequence_messages TO authenticated;
GRANT ALL ON public.contact_sequence_messages TO service_role;
ALTER TABLE public.contact_sequence_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team contact sequences" ON public.contact_sequence_messages FOR ALL TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()) AND EXISTS (SELECT 1 FROM public.firm_contacts c WHERE c.id = contact_id AND c.firm_id = contact_sequence_messages.firm_id));
CREATE INDEX contact_sequences_due ON public.contact_sequence_messages(scheduled_at) WHERE email_status = 'approved' OR whatsapp_status = 'approved';
CREATE TABLE public.contact_sequence_deliveries (LIKE public.sequence_deliveries INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
ALTER TABLE public.contact_sequence_deliveries ADD PRIMARY KEY (id), ADD CONSTRAINT contact_delivery_sequence_fk FOREIGN KEY (sequence_id) REFERENCES public.contact_sequence_messages(id) ON DELETE CASCADE, ADD CONSTRAINT contact_delivery_destination_unique UNIQUE(sequence_id, channel, address);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contact_sequence_deliveries TO authenticated;
GRANT ALL ON public.contact_sequence_deliveries TO service_role;
ALTER TABLE public.contact_sequence_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team contact deliveries" ON public.contact_sequence_deliveries FOR ALL TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
COMMENT ON TABLE public.contact_sequence_messages IS 'Independent schedules per named contact; legacy firm sequences remain unchanged.';

-- ==========================================
-- Migration: 0018_add_notion_lead_source.sql
-- ==========================================

ALTER TYPE public.firm_source ADD VALUE IF NOT EXISTS 'notion';

-- ==========================================
-- Migration: 0019_firm_instagram.sql
-- ==========================================

ALTER TABLE public.firms ADD COLUMN IF NOT EXISTS instagram text;

-- ==========================================
-- Migration: 0020_offer_chain_review.sql
-- ==========================================

CREATE TABLE public.offer_catalog_settings (
 id text PRIMARY KEY DEFAULT 'default',
 catalog jsonb NOT NULL DEFAULT '[]'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.offer_catalog_settings TO authenticated;
GRANT ALL ON public.offer_catalog_settings TO service_role;
ALTER TABLE public.offer_catalog_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_team_read ON public.offer_catalog_settings FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY catalog_admin_insert ON public.offer_catalog_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY catalog_admin_update ON public.offer_catalog_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.ai_draft_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 firm_id uuid NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
 contact_id uuid REFERENCES public.firm_contacts(id) ON DELETE CASCADE,
 stage public.firm_stage NOT NULL,
 kind text NOT NULL,
 offer_card text NOT NULL DEFAULT '',
 offer_plan jsonb NOT NULL,
 output jsonb NOT NULL DEFAULT '{}'::jsonb,
 needs_input jsonb NOT NULL DEFAULT '[]'::jsonb,
 warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
 acknowledged_at timestamptz,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_draft_runs TO authenticated;
GRANT UPDATE (acknowledged_at) ON public.ai_draft_runs TO authenticated;
GRANT ALL ON public.ai_draft_runs TO service_role;
ALTER TABLE public.ai_draft_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY draft_runs_team_read ON public.ai_draft_runs FOR SELECT TO authenticated USING (public.is_team_member(auth.uid()));
CREATE POLICY draft_runs_team_ack ON public.ai_draft_runs FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid())) WITH CHECK (public.is_team_member(auth.uid()));
ALTER TABLE public.sequence_messages ADD COLUMN email_ai_run_id uuid REFERENCES public.ai_draft_runs(id), ADD COLUMN whatsapp_ai_run_id uuid REFERENCES public.ai_draft_runs(id), ADD COLUMN ai_touch_id text;
ALTER TABLE public.contact_sequence_messages ADD COLUMN email_ai_run_id uuid REFERENCES public.ai_draft_runs(id), ADD COLUMN whatsapp_ai_run_id uuid REFERENCES public.ai_draft_runs(id), ADD COLUMN ai_touch_id text;
CREATE INDEX ai_draft_runs_firm_stage ON public.ai_draft_runs(firm_id, stage, created_at DESC);
CREATE OR REPLACE FUNCTION public.validate_ai_sequence_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch text; run_id uuid; r public.ai_draft_runs; msg jsonb; next_status text; old_status text;
BEGIN
 IF current_user <> 'service_role' AND coalesce(auth.role(), '') <> 'service_role' THEN
  IF TG_OP = 'INSERT' THEN
   IF NEW.email_ai_run_id IS NOT NULL OR NEW.whatsapp_ai_run_id IS NOT NULL OR NEW.ai_touch_id IS NOT NULL THEN RAISE EXCEPTION 'AI metadata is written only by the drafting service'; END IF;
  ELSE
   IF NEW.email_ai_run_id IS DISTINCT FROM OLD.email_ai_run_id OR NEW.whatsapp_ai_run_id IS DISTINCT FROM OLD.whatsapp_ai_run_id OR NEW.ai_touch_id IS DISTINCT FROM OLD.ai_touch_id THEN RAISE EXCEPTION 'AI review metadata cannot be changed'; END IF;
  END IF;
 END IF;
 FOREACH ch IN ARRAY ARRAY['email','whatsapp'] LOOP
  run_id := CASE WHEN ch = 'email' THEN NEW.email_ai_run_id ELSE NEW.whatsapp_ai_run_id END;
  next_status := CASE WHEN ch = 'email' THEN NEW.email_status ELSE NEW.whatsapp_status END;
  old_status := CASE WHEN TG_OP = 'INSERT' THEN 'draft' WHEN ch = 'email' THEN OLD.email_status ELSE OLD.whatsapp_status END;
  IF run_id IS NOT NULL AND next_status IN ('approved','sending') AND next_status IS DISTINCT FROM old_status THEN
   SELECT * INTO r FROM public.ai_draft_runs WHERE id = run_id;
   IF NOT FOUND OR r.firm_id <> NEW.firm_id OR r.stage <> NEW.stage OR r.contact_id IS DISTINCT FROM (to_jsonb(NEW)->>'contact_id')::uuid THEN RAISE EXCEPTION 'AI review does not belong to this sequence'; END IF;
   IF r.offer_plan->>'status' = 'do_not_pitch' THEN RAISE EXCEPTION 'Do not pitch: no AI messages can be approved'; END IF;
   IF (jsonb_array_length(r.needs_input) > 0 OR jsonb_array_length(r.warnings) > 0) AND r.acknowledged_at IS NULL THEN RAISE EXCEPTION 'Review and acknowledge missing input and warnings first'; END IF;
   SELECT value INTO msg FROM jsonb_array_elements(coalesce(r.output->'messages','[]'::jsonb)) WHERE value->>'touch_id' = NEW.ai_touch_id;
   IF msg IS NULL THEN RAISE EXCEPTION 'No generated message for this touch'; END IF;
   IF ch = 'whatsapp' AND coalesce((msg->'whatsapp'->>'eligible')::boolean,false) = false THEN RAISE EXCEPTION 'WhatsApp is not eligible for this message'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER sequence_ai_review BEFORE INSERT OR UPDATE ON public.sequence_messages FOR EACH ROW EXECUTE FUNCTION public.validate_ai_sequence_review();
CREATE TRIGGER contact_sequence_ai_review BEFORE INSERT OR UPDATE ON public.contact_sequence_messages FOR EACH ROW EXECUTE FUNCTION public.validate_ai_sequence_review();

-- ==========================================
-- Migration: 0021_optional_draft_inputs.sql
-- ==========================================

CREATE OR REPLACE FUNCTION public.validate_ai_sequence_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch text; run_id uuid; r public.ai_draft_runs; msg jsonb; next_status text; old_status text;
BEGIN
 IF current_user <> 'service_role' AND coalesce(auth.role(), '') <> 'service_role' THEN
  IF TG_OP = 'INSERT' THEN
   IF NEW.email_ai_run_id IS NOT NULL OR NEW.whatsapp_ai_run_id IS NOT NULL OR NEW.ai_touch_id IS NOT NULL THEN RAISE EXCEPTION 'AI metadata is written only by the drafting service'; END IF;
  ELSE
   IF NEW.email_ai_run_id IS DISTINCT FROM OLD.email_ai_run_id OR NEW.whatsapp_ai_run_id IS DISTINCT FROM OLD.whatsapp_ai_run_id OR NEW.ai_touch_id IS DISTINCT FROM OLD.ai_touch_id THEN RAISE EXCEPTION 'AI review metadata cannot be changed'; END IF;
  END IF;
 END IF;
 FOREACH ch IN ARRAY ARRAY['email','whatsapp'] LOOP
  run_id := CASE WHEN ch = 'email' THEN NEW.email_ai_run_id ELSE NEW.whatsapp_ai_run_id END;
  next_status := CASE WHEN ch = 'email' THEN NEW.email_status ELSE NEW.whatsapp_status END;
  old_status := CASE WHEN TG_OP = 'INSERT' THEN 'draft' WHEN ch = 'email' THEN OLD.email_status ELSE OLD.whatsapp_status END;
  IF run_id IS NOT NULL AND next_status IN ('approved','sending') AND next_status IS DISTINCT FROM old_status THEN
   SELECT * INTO r FROM public.ai_draft_runs WHERE id = run_id;
   IF NOT FOUND OR r.firm_id <> NEW.firm_id OR r.stage <> NEW.stage OR r.contact_id IS DISTINCT FROM (to_jsonb(NEW)->>'contact_id')::uuid THEN RAISE EXCEPTION 'AI review does not belong to this sequence'; END IF;
   IF r.offer_plan->>'status' = 'do_not_pitch' THEN RAISE EXCEPTION 'Do not pitch: no AI messages can be approved'; END IF;
   IF jsonb_array_length(r.warnings) > 0 AND r.acknowledged_at IS NULL THEN RAISE EXCEPTION 'Review and acknowledge warnings first'; END IF;
   SELECT value INTO msg FROM jsonb_array_elements(coalesce(r.output->'messages','[]'::jsonb)) WHERE value->>'touch_id' = NEW.ai_touch_id;
   IF msg IS NULL THEN RAISE EXCEPTION 'No generated message for this touch'; END IF;
   IF ch = 'whatsapp' AND coalesce((msg->'whatsapp'->>'eligible')::boolean,false) = false THEN RAISE EXCEPTION 'WhatsApp is not eligible for this message'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;

-- ==========================================
-- Migration: 0022_remove_draft_warning_acknowledgement.sql
-- ==========================================

CREATE OR REPLACE FUNCTION public.validate_ai_sequence_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ch text; run_id uuid; r public.ai_draft_runs; msg jsonb; next_status text; old_status text;
BEGIN
 IF current_user <> 'service_role' AND coalesce(auth.role(), '') <> 'service_role' THEN
  IF TG_OP = 'INSERT' THEN
   IF NEW.email_ai_run_id IS NOT NULL OR NEW.whatsapp_ai_run_id IS NOT NULL OR NEW.ai_touch_id IS NOT NULL THEN RAISE EXCEPTION 'AI metadata is written only by the drafting service'; END IF;
  ELSE
   IF NEW.email_ai_run_id IS DISTINCT FROM OLD.email_ai_run_id OR NEW.whatsapp_ai_run_id IS DISTINCT FROM OLD.whatsapp_ai_run_id OR NEW.ai_touch_id IS DISTINCT FROM OLD.ai_touch_id THEN RAISE EXCEPTION 'AI review metadata cannot be changed'; END IF;
  END IF;
 END IF;
 FOREACH ch IN ARRAY ARRAY['email','whatsapp'] LOOP
  run_id := CASE WHEN ch = 'email' THEN NEW.email_ai_run_id ELSE NEW.whatsapp_ai_run_id END;
  next_status := CASE WHEN ch = 'email' THEN NEW.email_status ELSE NEW.whatsapp_status END;
  old_status := CASE WHEN TG_OP = 'INSERT' THEN 'draft' WHEN ch = 'email' THEN OLD.email_status ELSE OLD.whatsapp_status END;
  IF run_id IS NOT NULL AND next_status IN ('approved','sending') AND next_status IS DISTINCT FROM old_status THEN
   SELECT * INTO r FROM public.ai_draft_runs WHERE id = run_id;
   IF NOT FOUND OR r.firm_id <> NEW.firm_id OR r.stage <> NEW.stage OR r.contact_id IS DISTINCT FROM (to_jsonb(NEW)->>'contact_id')::uuid THEN RAISE EXCEPTION 'AI review does not belong to this sequence'; END IF;
   IF r.offer_plan->>'status' = 'do_not_pitch' THEN RAISE EXCEPTION 'Do not pitch: no AI messages can be approved'; END IF;
   SELECT value INTO msg FROM jsonb_array_elements(coalesce(r.output->'messages','[]'::jsonb)) WHERE value->>'touch_id' = NEW.ai_touch_id;
   IF msg IS NULL THEN RAISE EXCEPTION 'No generated message for this touch'; END IF;
   IF ch = 'whatsapp' AND coalesce((msg->'whatsapp'->>'eligible')::boolean,false) = false THEN RAISE EXCEPTION 'WhatsApp is not eligible for this message'; END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
COMMENT ON COLUMN public.ai_draft_runs.acknowledged_at IS 'DEPRECATED: draft warnings no longer require acknowledgement; retained for historical records.';

-- ==========================================
-- Migration: 0023_add_backlog_stage.sql
-- ==========================================

ALTER TYPE public.firm_stage ADD VALUE IF NOT EXISTS 'backlog' BEFORE 'outreach';

-- ==========================================
-- Migration: 0024_enforce_backlog_first_send.sql
-- ==========================================

ALTER TABLE public.firms ALTER COLUMN stage SET DEFAULT 'backlog'::public.firm_stage;
CREATE OR REPLACE FUNCTION public.firm_has_outgoing_send(_firm_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM public.email_messages WHERE firm_id=_firm_id AND direction='out' AND (status IN ('sent','submitted','enqueued','delivered','read') OR provider_message_id IS NOT NULL)) OR EXISTS (SELECT 1 FROM public.whatsapp_messages WHERE firm_id=_firm_id AND direction='out' AND (status IN ('sent','submitted','enqueued','delivered','read') OR provider_message_id IS NOT NULL));
$$;
REVOKE ALL ON FUNCTION public.firm_has_outgoing_send(uuid) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.enforce_firm_backlog() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.stage IN ('backlog','outreach') THEN
  IF public.firm_has_outgoing_send(NEW.id) THEN NEW.stage := 'outreach'; ELSE NEW.stage := 'backlog'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER firms_backlog BEFORE INSERT OR UPDATE OF stage ON public.firms FOR EACH ROW EXECUTE FUNCTION public.enforce_firm_backlog();
CREATE OR REPLACE FUNCTION public.promote_backlog_on_send() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.firm_id IS NOT NULL AND NEW.direction='out' AND NEW.status IN ('sent','submitted','enqueued','delivered','read') THEN
  UPDATE public.firms SET stage='outreach' WHERE id=NEW.firm_id AND stage='backlog';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER email_promote_backlog AFTER INSERT OR UPDATE OF status ON public.email_messages FOR EACH ROW EXECUTE FUNCTION public.promote_backlog_on_send();
CREATE TRIGGER whatsapp_promote_backlog AFTER INSERT OR UPDATE OF status ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.promote_backlog_on_send();
CREATE OR REPLACE FUNCTION public.message_set_stage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.stage IS NULL AND NEW.firm_id IS NOT NULL THEN
  SELECT CASE WHEN stage='backlog' THEN 'outreach'::public.firm_stage ELSE stage END INTO NEW.stage FROM public.firms WHERE id=NEW.firm_id;
 END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.stop_channel_sequences_on_stage_change() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.stage IS DISTINCT FROM OLD.stage THEN
  UPDATE public.sequence_channel_messages SET status='skipped',scheduled_at=NULL,result='Firm moved to another stage',updated_at=now() WHERE firm_id=NEW.id AND stage <> CASE WHEN NEW.stage='backlog' THEN 'outreach'::public.firm_stage ELSE NEW.stage END AND status IN ('draft','approved');
 END IF;
 RETURN NEW;
END;
$$;

-- ==========================================
-- Migration: 0025_create_campaigns.sql
-- ==========================================

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

-- ==========================================
-- Migration: 0026_campaign_phases.sql
-- ==========================================

ALTER TABLE public.campaign_firms ADD COLUMN phase text NOT NULL DEFAULT 'research';
ALTER TABLE public.campaigns ADD COLUMN pause_reason text;

-- ==========================================
-- Migration: 0027_campaign_low_fit_status.sql
-- ==========================================

ALTER TABLE public.campaign_firms DROP CONSTRAINT campaign_firms_status_chk;
ALTER TABLE public.campaign_firms ADD CONSTRAINT campaign_firms_status_chk CHECK (status IN ('pending','processing','scheduled','missing_contact','failed','low_fit'));
ALTER TABLE public.campaign_firms ADD COLUMN fit_score integer;

-- ==========================================
-- Migration: 0028_add_firm_fit_columns.sql
-- ==========================================

-- Store the research brief's fit verdict on the firm so pipeline cards can show it without loading briefs.

ALTER TABLE public.firms
  ADD COLUMN IF NOT EXISTS fit_score numeric(4,1),
  ADD COLUMN IF NOT EXISTS fit_max smallint,
  ADD COLUMN IF NOT EXISTS fit_tier text;

COMMENT ON COLUMN public.firms.fit_score IS 'Fit score quoted by the latest research brief summary, on the same scale as fit_max. NULL when the brief has no score.';
COMMENT ON COLUMN public.firms.fit_max IS 'Scale of fit_score (5 or 10), taken from the brief text.';
COMMENT ON COLUMN public.firms.fit_tier IS 'Fit tier A-D quoted by the latest research brief summary.';

-- Reads "fit score 2/5", "Fit score: 8/10", "Fit: 4/10", "Tier C" out of a brief summary.
CREATE OR REPLACE FUNCTION public.parse_firm_fit(summary text)
RETURNS TABLE(fit_score numeric, fit_max smallint, fit_tier text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE WHEN g IS NULL THEN NULL ELSE LEAST(10::numeric, GREATEST(0::numeric, g[1]::numeric)) END,
    CASE WHEN g IS NULL THEN NULL ELSE g[2]::smallint END,
    (regexp_match(summary, '(?i)\btier\b[^A-Za-z]{0,3}([A-D])\b'))[1]
  FROM (SELECT regexp_match(summary, '(?i)\bfit(?:\s+score)?\s*[:\-]?\s*([0-9]{1,2}(?:\.[0-9])?)\s*/\s*(5|10)\b') AS g) t;
$$;

CREATE OR REPLACE FUNCTION public.sync_firm_fit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric;
  v_max smallint;
  v_tier text;
BEGIN
  SELECT p.fit_score, p.fit_max, p.fit_tier
    INTO v_score, v_max, v_tier
    FROM public.parse_firm_fit(NEW.brief->>'summary') AS p;
  UPDATE public.firms
     SET fit_score = v_score,
         fit_max = v_max,
         fit_tier = v_tier
   WHERE id = NEW.firm_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS firm_research_sync_fit ON public.firm_research;
CREATE TRIGGER firm_research_sync_fit
AFTER INSERT OR UPDATE OF brief ON public.firm_research
FOR EACH ROW EXECUTE FUNCTION public.sync_firm_fit();

-- Backfill firms whose brief was written before this trigger existed.
UPDATE public.firms f
   SET fit_score = s.fit_score,
       fit_max = s.fit_max,
       fit_tier = s.fit_tier
  FROM (
    SELECT DISTINCT ON (r.firm_id) r.firm_id, p.fit_score, p.fit_max, p.fit_tier
      FROM public.firm_research r
      CROSS JOIN LATERAL public.parse_firm_fit(r.brief->>'summary') AS p
     ORDER BY r.firm_id, r.created_at DESC
  ) s
 WHERE f.id = s.firm_id;

GRANT SELECT ON public.firms TO authenticated;
GRANT ALL ON public.firms TO service_role;

-- ==========================================
-- Migration: 0029_fix_firm_fit_parser.sql
-- ==========================================

-- Parse the fit verdict with patterns that actually match the briefs (Postgres regex without inline (?i) flags).

CREATE OR REPLACE FUNCTION public.parse_firm_fit(summary text)
RETURNS TABLE(fit_score numeric, fit_max smallint, fit_tier text)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE WHEN g IS NULL THEN NULL
         ELSE LEAST(g[4]::numeric, GREATEST(0::numeric, g[2]::numeric)) END,
    CASE WHEN g IS NULL THEN NULL ELSE g[4]::smallint END,
    upper((regexp_match(summary, '(^|[^a-z])tier[^A-Za-z0-9]{0,3}([A-D]|[1-4])([^0-9/]|$)', 'i'))[2])
  FROM (SELECT regexp_match(summary, '(^|[^a-z])fit[^0-9]{0,10}([0-9]{1,3}([.][0-9]){0,1})[[:space:]]*/[[:space:]]*(5|10|100)([^0-9]|$)', 'i') AS g) t;
$$;

-- Re-derive stored values with the corrected parser.
UPDATE public.firms f
   SET fit_score = s.fit_score,
       fit_max = s.fit_max,
       fit_tier = s.fit_tier
  FROM (
    SELECT DISTINCT ON (r.firm_id) r.firm_id, p.fit_score, p.fit_max, p.fit_tier
      FROM public.firm_research r
      CROSS JOIN LATERAL public.parse_firm_fit(r.brief->>'summary') AS p
     ORDER BY r.firm_id, r.created_at DESC
  ) s
 WHERE f.id = s.firm_id;

-- ==========================================
-- Migration: 0030_firm_fit_from_latest_brief.sql
-- ==========================================

-- The stored fit verdict must come from the firm's most recent brief, whichever row fired the trigger.

CREATE OR REPLACE FUNCTION public.sync_firm_fit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_firm uuid;
  v_score numeric;
  v_max smallint;
  v_tier text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_firm := OLD.firm_id;
  ELSE
    v_firm := NEW.firm_id;
  END IF;

  SELECT p.fit_score, p.fit_max, p.fit_tier
    INTO v_score, v_max, v_tier
    FROM public.firm_research r
    CROSS JOIN LATERAL public.parse_firm_fit(r.brief->>'summary') AS p
   WHERE r.firm_id = v_firm
   ORDER BY r.created_at DESC, r.id DESC
   LIMIT 1;

  UPDATE public.firms
     SET fit_score = v_score,
         fit_max = v_max,
         fit_tier = v_tier
   WHERE id = v_firm;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS firm_research_sync_fit ON public.firm_research;
CREATE TRIGGER firm_research_sync_fit
AFTER INSERT OR UPDATE OF brief OR DELETE ON public.firm_research
FOR EACH ROW EXECUTE FUNCTION public.sync_firm_fit();

-- Repair firms whose stored verdict was taken from an older brief.
UPDATE public.firms f
   SET fit_score = s.fit_score,
       fit_max = s.fit_max,
       fit_tier = s.fit_tier
  FROM (
    SELECT DISTINCT ON (r.firm_id) r.firm_id, p.fit_score, p.fit_max, p.fit_tier
      FROM public.firm_research r
      CROSS JOIN LATERAL public.parse_firm_fit(r.brief->>'summary') AS p
     ORDER BY r.firm_id, r.created_at DESC, r.id DESC
  ) s
 WHERE f.id = s.firm_id
   AND (f.fit_score IS DISTINCT FROM s.fit_score
        OR f.fit_max IS DISTINCT FROM s.fit_max
        OR f.fit_tier IS DISTINCT FROM s.fit_tier);

-- ==========================================
-- Migration: 0031_whatsapp_consent_overrides_stale_ai_flag.sql
-- ==========================================

CREATE OR REPLACE FUNCTION public.validate_ai_sequence_review()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
DECLARE ch text; run_id uuid; r public.ai_draft_runs; msg jsonb; next_status text; old_status text; consent boolean;
BEGIN
 IF current_user <> 'service_role' AND coalesce(auth.role(), '') <> 'service_role' THEN
  IF TG_OP = 'INSERT' THEN
   IF NEW.email_ai_run_id IS NOT NULL OR NEW.whatsapp_ai_run_id IS NOT NULL OR NEW.ai_touch_id IS NOT NULL THEN RAISE EXCEPTION 'AI metadata is written only by the drafting service'; END IF;
  ELSE
   IF NEW.email_ai_run_id IS DISTINCT FROM OLD.email_ai_run_id OR NEW.whatsapp_ai_run_id IS DISTINCT FROM OLD.whatsapp_ai_run_id OR NEW.ai_touch_id IS DISTINCT FROM OLD.ai_touch_id THEN RAISE EXCEPTION 'AI review metadata cannot be changed'; END IF;
  END IF;
 END IF;
 FOREACH ch IN ARRAY ARRAY['email','whatsapp'] LOOP
  run_id := CASE WHEN ch = 'email' THEN NEW.email_ai_run_id ELSE NEW.whatsapp_ai_run_id END;
  next_status := CASE WHEN ch = 'email' THEN NEW.email_status ELSE NEW.whatsapp_status END;
  old_status := CASE WHEN TG_OP = 'INSERT' THEN 'draft' WHEN ch = 'email' THEN OLD.email_status ELSE OLD.whatsapp_status END;
  IF run_id IS NOT NULL AND next_status IN ('approved','sending') AND next_status IS DISTINCT FROM old_status THEN
   SELECT * INTO r FROM public.ai_draft_runs WHERE id = run_id;
   IF NOT FOUND OR r.firm_id <> NEW.firm_id OR r.stage <> NEW.stage OR r.contact_id IS DISTINCT FROM (to_jsonb(NEW)->>'contact_id')::uuid THEN RAISE EXCEPTION 'AI review does not belong to this sequence'; END IF;
   IF r.offer_plan->>'status' = 'do_not_pitch' THEN RAISE EXCEPTION 'Do not pitch: no AI messages can be approved'; END IF;
   SELECT value INTO msg FROM jsonb_array_elements(coalesce(r.output->'messages','[]'::jsonb)) WHERE value->>'touch_id' = NEW.ai_touch_id;
   IF msg IS NULL THEN RAISE EXCEPTION 'No generated message for this touch'; END IF;
   IF ch = 'whatsapp' AND coalesce((msg->'whatsapp'->>'eligible')::boolean,false) = false THEN
    -- Current firm consent overrides a stale AI eligibility flag.
    SELECT whatsapp_opt_in INTO consent FROM public.firms WHERE id = NEW.firm_id;
    IF coalesce(consent,false) = false THEN RAISE EXCEPTION 'WhatsApp is not eligible for this message'; END IF;
   END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $fn$;

