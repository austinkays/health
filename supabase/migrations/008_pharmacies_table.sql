-- ============================================================
-- 008: Pharmacies table — first-class pharmacy records
-- ============================================================

create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '',
  address text not null default '',
  phone text not null default '',
  fax text not null default '',
  hours text not null default '',
  website text not null default '',
  is_preferred boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pharmacies enable row level security;

create policy "Users manage own pharmacies"
  on public.pharmacies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-update updated_at
create trigger set_updated_at
  before update on public.pharmacies
  for each row execute function public.set_updated_at();

-- Index for user lookups
create index if not exists idx_pharmacies_user_id on public.pharmacies(user_id);
