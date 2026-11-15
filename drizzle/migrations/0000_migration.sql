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