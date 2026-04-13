-- 031_stripe_ids.sql
-- Add Stripe customer and subscription IDs to profiles for billing portal lookups.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
