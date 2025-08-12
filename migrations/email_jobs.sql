-- Create email_jobs table for email queue system
CREATE TABLE IF NOT EXISTS email_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    template_type TEXT NOT NULL,
    subject TEXT NOT NULL,
    html_content TEXT NOT NULL,
    text_content TEXT NOT NULL,
    scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    sent_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_email_jobs_status ON email_jobs(status);
CREATE INDEX IF NOT EXISTS idx_email_jobs_scheduled_for ON email_jobs(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_jobs_template_type ON email_jobs(template_type);
CREATE INDEX IF NOT EXISTS idx_email_jobs_user_id ON email_jobs(user_id);

-- Enable RLS
ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies - only allow service role to access (for security)
CREATE POLICY "Service role can manage email jobs" ON email_jobs
    FOR ALL USING (auth.role() = 'service_role');