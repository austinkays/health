-- Salve — Migration 005: AI Health Summary
-- Adds auto-generated health summary column to profiles.
-- Run in: Supabase Dashboard → SQL Editor → New Query

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_health_summary text NOT NULL DEFAULT '';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_summary_updated_at timestamptz;
