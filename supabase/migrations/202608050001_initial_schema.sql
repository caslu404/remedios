create extension if not exists pgcrypto;

create type public.treatment_status as enum ('active', 'completed', 'paused');
create type public.schedule_status as enum ('draft', 'confirmed', 'requires_review', 'superseded');
create type public.dose_status as enum ('planned', 'notified', 'snoozed', 'taken_on_time', 'taken_late', 'taken_early', 'skipped', 'missed', 'cancelled_by_schedule_change', 'requires_review');
create type public.notification_status as enum ('queued', 'processing', 'sent', 'failed', 'cancelled');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null default 'Lucas',
  timezone text not null default 'America/Sao_Paulo',
  usual_bedtime time not null default '23:30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.treatments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date,
  status public.treatment_status not null default 'active',
  medical_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.medications (
  id uuid primary key default gen_random_uuid(),
  treatment_id uuid not null references public.treatments(id) on delete cascade,
  slug text not null,
  display_name text not null,
  full_name text not null,
  strength text,
  unit text not null,
  form text not null,
  notes text,
  continuous boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (treatment_id, slug)
);

create table public.medication_phases (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete cascade,
  client_key text not null,
  phase_name text not null,
  start_date date not null,
  end_date date,
  dose_quantity numeric(8, 2) not null check (dose_quantity > 0),
  dose_unit text not null,
  doses_per_day smallint not null check (doses_per_day > 0),
  target_interval_minutes integer check (target_interval_minutes is null or target_interval_minutes > 0),
  minimum_interval_minutes integer check (minimum_interval_minutes is null or minimum_interval_minutes > 0),
  maximum_interval_minutes integer check (maximum_interval_minutes is null or maximum_interval_minutes > 0),
  rigidity text not null check (rigidity in ('high', 'medium', 'low')),
  slot_strategy text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (medication_id, client_key),
  check (minimum_interval_minutes is null or maximum_interval_minutes is null or minimum_interval_minutes <= maximum_interval_minutes)
);

create table public.medication_rules (
  id uuid primary key default gen_random_uuid(),
  medication_phase_id uuid not null references public.medication_phases(id) on delete cascade,
  rule_type text not null,
  rule_config_json jsonb not null default '{}'::jsonb,
  is_hard_constraint boolean not null,
  source text,
  confirmed_at timestamptz,
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (medication_phase_id, rule_type)
);

create table public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  wake_time time not null,
  planned_bedtime time not null,
  breakfast_window jsonb not null,
  lunch_window jsonb,
  dinner_window jsonb not null,
  timezone text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.daily_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null,
  version integer not null check (version > 0),
  status public.schedule_status not null default 'draft',
  generated_at timestamptz not null,
  confirmed_at timestamptz,
  generation_reason text not null,
  snapshot_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, date, version)
);

create table public.scheduled_doses (
  id uuid primary key default gen_random_uuid(),
  daily_schedule_id uuid not null references public.daily_schedules(id) on delete cascade,
  medication_phase_id uuid not null references public.medication_phases(id) on delete restrict,
  client_key text not null,
  scheduled_at timestamptz,
  scheduled_local time,
  sequence_number smallint not null check (sequence_number > 0),
  status public.dose_status not null default 'planned',
  taken_at timestamptz,
  quantity numeric(8, 2) not null check (quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (daily_schedule_id, client_key),
  unique (daily_schedule_id, medication_phase_id, sequence_number)
);

create table public.schedule_events (
  id uuid primary key default gen_random_uuid(),
  daily_schedule_id uuid not null references public.daily_schedules(id) on delete cascade,
  client_event_id uuid,
  event_type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (daily_schedule_id, client_event_id)
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  user_agent text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz,
  last_failure_at timestamptz
);

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  scheduled_dose_id uuid references public.scheduled_doses(id) on delete cascade,
  send_at timestamptz not null,
  type text not null,
  payload_json jsonb not null,
  status public.notification_status not null default 'queued',
  attempt_count integer not null default 0,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scheduled_dose_id, type, send_at)
);

create table public.initial_treatment_templates (
  key text primary key,
  version integer not null,
  config_json jsonb not null,
  created_at timestamptz not null default now()
);

create table public.api_rate_limits (
  user_id uuid not null references public.users(id) on delete cascade,
  route text not null,
  bucket timestamptz not null,
  request_count integer not null default 1,
  primary key (user_id, route, bucket)
);

create index schedules_user_date_idx on public.daily_schedules(user_id, date desc, version desc);
create index doses_schedule_status_idx on public.scheduled_doses(daily_schedule_id, status);
create index notification_due_idx on public.notification_jobs(status, send_at) where status = 'queued';
create index treatment_user_status_idx on public.treatments(user_id, status);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['users','treatments','medications','medication_phases','medication_rules','daily_checkins','scheduled_doses','push_subscriptions','notification_jobs']
  loop
    execute format('create trigger set_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'name', 'Lucas'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.users enable row level security;
alter table public.treatments enable row level security;
alter table public.medications enable row level security;
alter table public.medication_phases enable row level security;
alter table public.medication_rules enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.daily_schedules enable row level security;
alter table public.scheduled_doses enable row level security;
alter table public.schedule_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_jobs enable row level security;
alter table public.initial_treatment_templates enable row level security;
alter table public.api_rate_limits enable row level security;

create policy users_own_rows on public.users for all using (id = auth.uid()) with check (id = auth.uid());
create policy treatments_own_rows on public.treatments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy medications_own_rows on public.medications for all using (exists (select 1 from public.treatments t where t.id = treatment_id and t.user_id = auth.uid())) with check (exists (select 1 from public.treatments t where t.id = treatment_id and t.user_id = auth.uid()));
create policy phases_own_rows on public.medication_phases for all using (exists (select 1 from public.medications m join public.treatments t on t.id = m.treatment_id where m.id = medication_id and t.user_id = auth.uid())) with check (exists (select 1 from public.medications m join public.treatments t on t.id = m.treatment_id where m.id = medication_id and t.user_id = auth.uid()));
create policy rules_own_rows on public.medication_rules for all using (exists (select 1 from public.medication_phases p join public.medications m on m.id = p.medication_id join public.treatments t on t.id = m.treatment_id where p.id = medication_phase_id and t.user_id = auth.uid())) with check (exists (select 1 from public.medication_phases p join public.medications m on m.id = p.medication_id join public.treatments t on t.id = m.treatment_id where p.id = medication_phase_id and t.user_id = auth.uid()));
create policy checkins_own_rows on public.daily_checkins for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy schedules_own_rows on public.daily_schedules for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy doses_own_rows on public.scheduled_doses for all using (exists (select 1 from public.daily_schedules s where s.id = daily_schedule_id and s.user_id = auth.uid())) with check (exists (select 1 from public.daily_schedules s where s.id = daily_schedule_id and s.user_id = auth.uid()));
create policy events_own_rows on public.schedule_events for all using (exists (select 1 from public.daily_schedules s where s.id = daily_schedule_id and s.user_id = auth.uid())) with check (exists (select 1 from public.daily_schedules s where s.id = daily_schedule_id and s.user_id = auth.uid()));
create policy subscriptions_own_rows on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy jobs_own_rows on public.notification_jobs for select using (user_id = auth.uid());
create policy jobs_own_insert on public.notification_jobs for insert with check (user_id = auth.uid());
create policy jobs_own_update on public.notification_jobs for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy templates_authenticated_read on public.initial_treatment_templates for select to authenticated using (true);

revoke all on public.initial_treatment_templates from anon;

create or replace function public.check_rate_limit(p_route text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_bucket timestamptz;
  new_count integer;
begin
  if current_user_id is null or p_limit < 1 or p_window_seconds < 1 then return false; end if;
  current_bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.api_rate_limits(user_id, route, bucket, request_count)
  values (current_user_id, p_route, current_bucket, 1)
  on conflict (user_id, route, bucket)
  do update set request_count = public.api_rate_limits.request_count + 1
  returning request_count into new_count;
  return new_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated;
