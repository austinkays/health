-- Salve — Migration 003: Comprehensive Health Data Schema
-- Adds 8 new tables for the v3 sync format.
-- Run in: Supabase Dashboard → SQL Editor → New Query

-- ============================================================
-- LABS (lab results, imaging, diagnostic studies)
-- ============================================================
create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null default '',
  test_name text not null default '',
  result text not null default '',
  unit text not null default '',
  range text not null default '',
  flag text not null default '',
  provider text not null default '',
  notes text not null default '',
  sync_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.labs enable row level security;
create policy "Users manage own labs" on public.labs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_labs_sync on public.labs (user_id, sync_id) where sync_id is not null;

-- ============================================================
-- PROCEDURES (surgeries, diagnostic, pain procedures)
-- ============================================================
create table if not exists public.procedures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null default '',
  name text not null default '',
  type text not null default '',
  provider text not null default '',
  location text not null default '',
  reason text not null default '',
  outcome text not null default '',
  notes text not null default '',
  sync_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.procedures enable row level security;
create policy "Users manage own procedures" on public.procedures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_procedures_sync on public.procedures (user_id, sync_id) where sync_id is not null;

-- ============================================================
-- IMMUNIZATIONS
-- ============================================================
create table if not exists public.immunizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null default '',
  name text not null default '',
  dose text not null default '',
  site text not null default '',
  lot_number text not null default '',
  provider text not null default '',
  location text not null default '',
  sync_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.immunizations enable row level security;
create policy "Users manage own immunizations" on public.immunizations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_immunizations_sync on public.immunizations (user_id, sync_id) where sync_id is not null;

-- ============================================================
-- CARE_GAPS (outstanding labs, overdue immunizations, gaps)
-- ============================================================
create table if not exists public.care_gaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default '',
  item text not null default '',
  last_done text not null default '',
  urgency text not null default '' check (urgency in ('urgent', 'needs prompt attention', 'worth raising at next appointment', 'routine', 'completed', '')),
  notes text not null default '',
  sync_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.care_gaps enable row level security;
create policy "Users manage own care_gaps" on public.care_gaps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_care_gaps_sync on public.care_gaps (user_id, sync_id) where sync_id is not null;

-- ============================================================
-- ANESTHESIA_FLAGS (safety-critical surgical flags)
-- ============================================================
create table if not exists public.anesthesia_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  condition text not null default '',
  implication text not null default '',
  action_required text not null default '',
  sync_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.anesthesia_flags enable row level security;
create policy "Users manage own anesthesia_flags" on public.anesthesia_flags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_anesthesia_flags_sync on public.anesthesia_flags (user_id, sync_id) where sync_id is not null;

-- ============================================================
-- APPEALS_AND_DISPUTES (insurance appeals, grievances)
-- ============================================================
create table if not exists public.appeals_and_disputes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date_filed text not null default '',
  subject text not null default '',
  against text not null default '',
  status text not null default '',
  deadline text not null default '',
  notes text not null default '',
  sync_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.appeals_and_disputes enable row level security;
create policy "Users manage own appeals_and_disputes" on public.appeals_and_disputes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_appeals_sync on public.appeals_and_disputes (user_id, sync_id) where sync_id is not null;

-- ============================================================
-- SURGICAL_PLANNING (future surgical plans and constraints)
-- ============================================================
create table if not exists public.surgical_planning (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  facility text not null default '',
  surgeon text not null default '',
  coordinator text not null default '',
  case_number text not null default '',
  procedures jsonb not null default '[]',
  procedures_not_on_list jsonb not null default '[]',
  target_date text not null default '',
  accommodation text not null default '',
  constraints jsonb not null default '[]',
  outstanding_items jsonb not null default '[]',
  status text not null default '',
  sync_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.surgical_planning enable row level security;
create policy "Users manage own surgical_planning" on public.surgical_planning
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_surgical_planning_sync on public.surgical_planning (user_id, sync_id) where sync_id is not null;

-- ============================================================
-- INSURANCE (coverage and financial assistance programs)
-- Note: replaces the flat settings fields with proper records
-- ============================================================
create table if not exists public.insurance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  type text not null default '',
  member_id text not null default '',
  "group" text not null default '',
  phone text not null default '',
  notes text not null default '',
  sync_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.insurance enable row level security;
create policy "Users manage own insurance" on public.insurance
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_insurance_sync on public.insurance (user_id, sync_id) where sync_id is not null;
