-- Add type column to allergies for categorization
-- (medication, food, environmental, latex, dye, insect, other)
alter table public.allergies
  add column if not exists type text not null default '';
