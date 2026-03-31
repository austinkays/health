-- Add video_call_url to appointments for telehealth links
alter table public.appointments
  add column if not exists video_call_url text not null default '';
