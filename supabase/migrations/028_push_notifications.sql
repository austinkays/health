-- 023: Push notifications — subscriptions, medication reminders, notification log

-- ── Push subscriptions (one per device per user) ──
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own push subscriptions" ON push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_push_sub_user_id
  BEFORE INSERT ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER update_push_sub_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Medication reminders (custom time per med) ──
CREATE TABLE IF NOT EXISTS medication_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_id uuid NOT NULL,
  reminder_time time NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, medication_id, reminder_time)
);

ALTER TABLE medication_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reminders" ON medication_reminders
  FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER set_reminder_user_id
  BEFORE INSERT ON medication_reminders
  FOR EACH ROW EXECUTE FUNCTION set_user_id();
CREATE TRIGGER update_reminder_updated_at
  BEFORE UPDATE ON medication_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_reminders_user ON medication_reminders(user_id);
CREATE INDEX idx_reminders_time ON medication_reminders(reminder_time) WHERE enabled = true;

-- ── Notification log (server-side tracking) ──
CREATE TABLE IF NOT EXISTS notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('medication','appointment','refill','journal','todo')),
  reference_id uuid,
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed')),
  error text
);

CREATE INDEX idx_notif_log_user_date ON notification_log(user_id, sent_at);

-- ── Add timezone to profiles ──
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Los_Angeles';

ALTER PUBLICATION supabase_realtime ADD TABLE push_subscriptions;
ALTER PUBLICATION supabase_realtime ADD TABLE medication_reminders;
