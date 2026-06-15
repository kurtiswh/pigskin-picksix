-- Add email jobs table for notification system
-- Migration: 012_add_email_jobs.sql

-- Create email_jobs table
CREATE TABLE IF NOT EXISTS email_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    template_type TEXT NOT NULL CHECK (template_type IN ('pick_reminder', 'deadline_alert', 'weekly_results', 'game_completed', 'picks_submitted', 'week_opened')),
    subject TEXT NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT NOT NULL,
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMPTZ
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_email_jobs_status_scheduled ON email_jobs (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_jobs_user_id ON email_jobs (user_id);
CREATE INDEX IF NOT EXISTS idx_email_jobs_template_type ON email_jobs (template_type);
CREATE INDEX IF NOT EXISTS idx_email_jobs_created_at ON email_jobs (created_at);

-- Add updated_at trigger (reuse existing function)
CREATE TRIGGER update_email_jobs_updated_at
    BEFORE UPDATE ON email_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own email jobs
CREATE POLICY "Users can view own email jobs" ON email_jobs
    FOR SELECT USING (auth.uid() = user_id);

-- Only authenticated users can insert email jobs (through the app)
CREATE POLICY "Authenticated users can insert email jobs" ON email_jobs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own email jobs (for cancellation)
CREATE POLICY "Users can update own email jobs" ON email_jobs
    FOR UPDATE USING (auth.uid() = user_id);

-- Add comments
COMMENT ON TABLE email_jobs IS 'Email notification jobs for scheduled delivery';
COMMENT ON COLUMN email_jobs.template_type IS 'Type of email template: pick_reminder, deadline_alert, weekly_results, game_completed, picks_submitted, week_opened';
COMMENT ON COLUMN email_jobs.status IS 'Email delivery status: pending, sent, failed, cancelled';
COMMENT ON COLUMN email_jobs.attempts IS 'Number of delivery attempts (max 3)';

-- Function to get weekly leaderboard for email notifications
CREATE OR REPLACE FUNCTION get_weekly_leaderboard(
  season_param INTEGER,
  week_param INTEGER
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  total_points INTEGER,
  wins INTEGER,
  losses INTEGER,
  pushes INTEGER,
  rank INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH user_stats AS (
    SELECT 
      u.id as user_id,
      u.display_name,
      COALESCE(SUM(p.points_earned), 0)::INTEGER as total_points,
      COUNT(CASE WHEN p.result = 'win' THEN 1 END)::INTEGER as wins,
      COUNT(CASE WHEN p.result = 'loss' THEN 1 END)::INTEGER as losses,
      COUNT(CASE WHEN p.result = 'push' THEN 1 END)::INTEGER as pushes
    FROM users u
    LEFT JOIN picks p ON u.id = p.user_id 
      AND p.season = season_param 
      AND p.week = week_param 
      AND p.submitted = true
    GROUP BY u.id, u.display_name
    HAVING COUNT(CASE WHEN p.submitted = true THEN 1 END) > 0  -- Only include users who submitted picks
  ),
  ranked_stats AS (
    SELECT 
      *,
      RANK() OVER (ORDER BY total_points DESC, wins DESC, losses ASC)::INTEGER as rank
    FROM user_stats
  )
  SELECT 
    rs.user_id,
    rs.display_name,
    rs.total_points,
    rs.wins,
    rs.losses, 
    rs.pushes,
    rs.rank
  FROM ranked_stats rs
  ORDER BY rs.rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;