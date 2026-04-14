-- 042: Allow admin tier to view and triage all user feedback
-- Adds additive RLS policies so admins can SELECT + UPDATE every feedback row.
-- Users continue to see only their own feedback via the existing policies from 022.
-- Does not grant DELETE to admins — they should never destroy user submissions.

CREATE POLICY "Admins see all feedback" ON feedback
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.tier = 'admin'
    )
  );

CREATE POLICY "Admins update all feedback" ON feedback
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.tier = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.tier = 'admin'
    )
  );
