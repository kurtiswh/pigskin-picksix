-- Add scoring and leaderboard completion status to week_settings
-- Migration 121: Add scoring completion status fields

-- Add new columns to week_settings table
ALTER TABLE week_settings 
ADD COLUMN scoring_complete BOOLEAN DEFAULT FALSE,
ADD COLUMN leaderboard_complete BOOLEAN DEFAULT FALSE,
ADD COLUMN admin_custom_message TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN week_settings.scoring_complete IS 'Whether admin has marked game scoring as complete and validated for this week';
COMMENT ON COLUMN week_settings.leaderboard_complete IS 'Whether admin has marked leaderboard as complete and validated for this week';
COMMENT ON COLUMN week_settings.admin_custom_message IS 'Optional custom message from admin to display in notices';

-- Update the RLS policy to allow admins to update these fields
-- First check if the policy exists and drop/recreate it
DROP POLICY IF EXISTS "Users can view week settings" ON week_settings;
DROP POLICY IF EXISTS "Admins can manage week settings" ON week_settings;

-- Recreate policies with updated permissions
CREATE POLICY "Users can view week settings" ON week_settings
FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Admins can manage week settings" ON week_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.is_admin = true
  )
);