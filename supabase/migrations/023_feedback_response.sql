-- 023: Add admin response fields to feedback
-- Allows the developer to respond to user feedback via Supabase dashboard.
-- Users see the response and status on their feedback card.

ALTER TABLE feedback ADD COLUMN IF NOT EXISTS response text;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS responded_at timestamptz;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','seen','in_progress','resolved','wont_fix'));
