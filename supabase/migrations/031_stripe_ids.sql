-- 031_stripe_ids.sql
-- Add Stripe customer/subscription IDs to profiles for billing portal access
-- and subscription state reconciliation via webhooks.
--
-- stripe_customer_id   — Stripe Customer object ID (cus_…), stored on first
--                        successful checkout so we can create billing portal sessions.
-- stripe_subscription_id — Stripe Subscription object ID (sub_…), stored for
--                          reference and potential reconciliation.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
