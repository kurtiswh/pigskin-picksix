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
CREATE INDEX idx_email_jobs_status_scheduled ON email_jobs (status, scheduled_for);
CREATE INDEX idx_email_jobs_user_id ON email_jobs (user_id);
CREATE INDEX idx_email_jobs_template_type ON email_jobs (template_type);
CREATE INDEX idx_email_jobs_created_at ON email_jobs (created_at);

-- Add updated_at trigger
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

-- Add comment
COMMENT ON TABLE email_jobs IS 'Email notification jobs for scheduled delivery';
COMMENT ON COLUMN email_jobs.template_type IS 'Type of email template: pick_reminder, deadline_alert, weekly_results, game_completed, picks_submitted, week_opened';
COMMENT ON COLUMN email_jobs.status IS 'Email delivery status: pending, sent, failed, cancelled';
COMMENT ON COLUMN email_jobs.attempts IS 'Number of delivery attempts (max 3)';