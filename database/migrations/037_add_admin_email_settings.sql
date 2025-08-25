-- Add admin email settings for configurable notification schedules
-- Migration: 037_add_admin_email_settings.sql

-- Create admin_email_settings table
CREATE TABLE IF NOT EXISTS admin_email_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    season INTEGER NOT NULL,
    setting_key TEXT NOT NULL,
    setting_value JSONB NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one setting per key per season
    UNIQUE(season, setting_key)
);

-- Add indexes for efficient querying
CREATE INDEX idx_admin_email_settings_season ON admin_email_settings (season);
CREATE INDEX idx_admin_email_settings_key ON admin_email_settings (setting_key);
CREATE INDEX idx_admin_email_settings_season_key ON admin_email_settings (season, setting_key);

-- Add updated_at trigger
CREATE TRIGGER update_admin_email_settings_updated_at
    BEFORE UPDATE ON admin_email_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE admin_email_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view email settings
CREATE POLICY "Admins can view email settings" ON admin_email_settings
    FOR SELECT TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Only admins can insert email settings
CREATE POLICY "Admins can insert email settings" ON admin_email_settings
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Only admins can update email settings
CREATE POLICY "Admins can update email settings" ON admin_email_settings
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND is_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Insert default email settings for current season
INSERT INTO admin_email_settings (season, setting_key, setting_value, created_by) VALUES 
(
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    'reminder_schedule',
    '{
        "enabled": true,
        "reminders": [
            {
                "name": "48 Hour Reminder",
                "hours_before_deadline": 48,
                "enabled": true
            },
            {
                "name": "24 Hour Reminder", 
                "hours_before_deadline": 24,
                "enabled": true
            },
            {
                "name": "Final Reminder",
                "hours_before_deadline": 2,
                "enabled": true
            }
        ]
    }'::jsonb,
    (SELECT id FROM users WHERE is_admin = true LIMIT 1)
),
(
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    'open_picks_notifications',
    '{
        "enabled": true,
        "send_immediately": true,
        "include_total_games": true
    }'::jsonb,
    (SELECT id FROM users WHERE is_admin = true LIMIT 1)
),
(
    EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
    'weekly_results',
    '{
        "enabled": true,
        "auto_send": true,
        "delay_hours": 2
    }'::jsonb,
    (SELECT id FROM users WHERE is_admin = true LIMIT 1)
) ON CONFLICT (season, setting_key) DO NOTHING;

-- Add comments
COMMENT ON TABLE admin_email_settings IS 'Admin-configurable email notification settings by season';
COMMENT ON COLUMN admin_email_settings.setting_key IS 'Setting category: reminder_schedule, open_picks_notifications, weekly_results';
COMMENT ON COLUMN admin_email_settings.setting_value IS 'JSON configuration for the email setting';