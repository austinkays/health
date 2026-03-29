-- Salve — Enrich User Profile Data Migration
-- Adds richer fields to profiles, providers, medications, conditions, allergies, appointments
-- All new columns default to '' (non-breaking, additive only)

-- ============================================================
-- 1. PROFILES — add DOB, sex, height, blood type, emergency contact, primary provider
-- ============================================================
alter table public.profiles add column if not exists dob text not null default '';
alter table public.profiles add column if not exists sex text not null default '';
alter table public.profiles add column if not exists height text not null default '';
alter table public.profiles add column if not exists blood_type text not null default '';
alter table public.profiles add column if not exists emergency_name text not null default '';
alter table public.profiles add column if not exists emergency_phone text not null default '';
alter table public.profiles add column if not exists emergency_relationship text not null default '';
alter table public.profiles add column if not exists primary_provider text not null default '';

-- ============================================================
-- 2. PROVIDERS — add address, email, NPI, accepted insurance
-- ============================================================
alter table public.providers add column if not exists address text not null default '';
alter table public.providers add column if not exists city text not null default '';
alter table public.providers add column if not exists state text not null default '';
alter table public.providers add column if not exists zip text not null default '';
alter table public.providers add column if not exists email text not null default '';
alter table public.providers add column if not exists npi text not null default '';
alter table public.providers add column if not exists accepted_insurance text not null default '';

-- ============================================================
-- 3. MEDICATIONS — add time_of_day, quantity, days_supply, manufacturer, prior_auth
-- ============================================================
alter table public.medications add column if not exists time_of_day text not null default '';
alter table public.medications add column if not exists quantity text not null default '';
alter table public.medications add column if not exists days_supply text not null default '';
alter table public.medications add column if not exists manufacturer text not null default '';
alter table public.medications add column if not exists prior_auth text not null default '';

-- ============================================================
-- 4. CONDITIONS — add icd10, severity, facility
-- ============================================================
alter table public.conditions add column if not exists icd10 text not null default '';
alter table public.conditions add column if not exists severity text not null default '';
alter table public.conditions add column if not exists facility text not null default '';

-- ============================================================
-- 5. ALLERGIES — add type, onset_date, confirmed_by
-- ============================================================
alter table public.allergies add column if not exists type text not null default '';
alter table public.allergies add column if not exists onset_date text not null default '';
alter table public.allergies add column if not exists confirmed_by text not null default '';

-- ============================================================
-- 6. APPOINTMENTS — add type (visit type), telehealth_url, linked_condition
-- ============================================================
alter table public.appointments add column if not exists visit_type text not null default '';
alter table public.appointments add column if not exists telehealth_url text not null default '';
alter table public.appointments add column if not exists linked_condition text not null default '';
