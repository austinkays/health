-- 039_notification_log_rls.sql
-- Enable RLS on notification_log (was missing per beta audit finding 2.1).
-- Without this, any authenticated user could read all users' notification logs
-- via the Supabase REST API.

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own notification logs"
  ON notification_log FOR SELECT
  USING (auth.uid() = user_id);
