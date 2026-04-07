-- About Me: structured personal profile data for form filling + AI context
alter table public.profiles add column if not exists about_me jsonb not null default '{}'::jsonb;

-- Medication category: distinguish medications from supplements/vitamins/herbal
alter table public.medications add column if not exists category text not null default 'medication'
  check (category in ('medication', 'supplement', 'vitamin', 'herbal'));
