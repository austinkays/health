-- Salve — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ============================================================
-- 1. PROFILES (1:1 with auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  location text not null default '',
  pharmacy text not null default '',
  insurance_plan text not null default '',
  insurance_id text not null default '',
  insurance_group text not null default '',
  insurance_phone text not null default '',
  health_background text not null default '',
  ai_mode text not null default 'onDemand' check (ai_mode in ('alwaysOn', 'onDemand', 'off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users manage own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 2. MEDICATIONS
-- ============================================================
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  dose text not null default '',
  frequency text not null default '',
  route text not null default 'Oral',
  prescriber text not null default '',
  pharmacy text not null default '',
  purpose text not null default '',
  start_date text not null default '',
  refill_date text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.medications enable row level security;
create policy "Users manage own medications" on public.medications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_medications_user on public.medications(user_id);

-- ============================================================
-- 3. CONDITIONS
-- ============================================================
create table public.conditions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  diagnosed_date text not null default '',
  status text not null default 'active' check (status in ('active', 'managed', 'remission', 'resolved')),
  provider text not null default '',
  linked_meds text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.conditions enable row level security;
create policy "Users manage own conditions" on public.conditions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_conditions_user on public.conditions(user_id);

-- ============================================================
-- 4. ALLERGIES
-- ============================================================
create table public.allergies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  substance text not null default '',
  reaction text not null default '',
  severity text not null default 'moderate' check (severity in ('mild', 'moderate', 'severe')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.allergies enable row level security;
create policy "Users manage own allergies" on public.allergies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_allergies_user on public.allergies(user_id);

-- ============================================================
-- 5. PROVIDERS
-- ============================================================
create table public.providers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  specialty text not null default '',
  clinic text not null default '',
  phone text not null default '',
  fax text not null default '',
  portal_url text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.providers enable row level security;
create policy "Users manage own providers" on public.providers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_providers_user on public.providers(user_id);

-- ============================================================
-- 6. VITALS
-- ============================================================
create table public.vitals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null default '',
  type text not null default 'pain' check (type in ('pain', 'mood', 'energy', 'sleep', 'bp', 'hr', 'weight', 'temp', 'glucose')),
  value text not null default '',
  value2 text not null default '',
  unit text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.vitals enable row level security;
create policy "Users manage own vitals" on public.vitals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_vitals_user_date on public.vitals(user_id, date desc);

-- ============================================================
-- 7. APPOINTMENTS
-- ============================================================
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null default '',
  time text not null default '',
  provider text not null default '',
  location text not null default '',
  reason text not null default '',
  questions text not null default '',
  post_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.appointments enable row level security;
create policy "Users manage own appointments" on public.appointments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_appointments_user_date on public.appointments(user_id, date desc);

-- ============================================================
-- 8. JOURNAL ENTRIES
-- ============================================================
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null default '',
  title text not null default '',
  mood text not null default '',
  severity text not null default '5',
  content text not null default '',
  tags text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_entries enable row level security;
create policy "Users manage own journal" on public.journal_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_journal_user_date on public.journal_entries(user_id, date desc);

-- ============================================================
-- 9. AI CONVERSATIONS
-- ============================================================
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_conversations enable row level security;
create policy "Users manage own conversations" on public.ai_conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index idx_conversations_user on public.ai_conversations(user_id);

-- ============================================================
-- 10. UPDATED_AT TRIGGER (auto-update on row change)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply to all tables with updated_at
create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.medications for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.conditions for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.allergies for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.providers for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.appointments for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.journal_entries for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.ai_conversations for each row execute function public.set_updated_at();

-- ============================================================
-- 11. ENABLE REALTIME for cross-device sync
-- ============================================================
alter publication supabase_realtime add table public.medications;
alter publication supabase_realtime add table public.conditions;
alter publication supabase_realtime add table public.allergies;
alter publication supabase_realtime add table public.providers;
alter publication supabase_realtime add table public.vitals;
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.journal_entries;
alter publication supabase_realtime add table public.profiles;
