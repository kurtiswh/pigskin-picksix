-- Add user preferences to support profile management
-- Migration: 011_add_user_preferences.sql

-- Add preferences column to users table
ALTER TABLE users 
ADD COLUMN preferences JSONB DEFAULT '{
  "email_notifications": true,
  "pick_reminders": true,
  "weekly_results": true,
  "deadline_alerts": true,
  "compact_view": false
}'::jsonb;

-- Add index for preferences queries
CREATE INDEX idx_users_preferences ON users USING GIN (preferences);

-- Add updated_at trigger if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update existing users to have default preferences
UPDATE users 
SET preferences = '{
  "email_notifications": true,
  "pick_reminders": true,
  "weekly_results": true,
  "deadline_alerts": true,
  "compact_view": false
}'::jsonb
WHERE preferences IS NULL;

-- Add comment
COMMENT ON COLUMN users.preferences IS 'User preferences stored as JSON: email notifications, UI preferences, etc.';