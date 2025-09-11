-- Migration: Add admin_note field to picks and anonymous_picks tables, and ensure submitted_at exists
-- This migration adds admin notes functionality and ensures submitted_at timestamps are available

-- Add admin_note to picks table
ALTER TABLE picks
ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- Add submitted_at to picks table if it doesn't exist
ALTER TABLE picks
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- Add admin_note to anonymous_picks table  
ALTER TABLE anonymous_picks
ADD COLUMN IF NOT EXISTS admin_note TEXT;

-- Add submitted_at to anonymous_picks table if it doesn't exist
ALTER TABLE anonymous_picks
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

-- Update existing picks to set submitted_at based on submitted status
UPDATE picks 
SET submitted_at = updated_at 
WHERE submitted = true AND submitted_at IS NULL;

UPDATE anonymous_picks 
SET submitted_at = updated_at 
WHERE submitted = true AND submitted_at IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN picks.admin_note IS 'Administrative note for this pick, visible to admins and the user';
COMMENT ON COLUMN picks.submitted_at IS 'Timestamp when the pick set was submitted';
COMMENT ON COLUMN anonymous_picks.admin_note IS 'Administrative note for this anonymous pick, visible to admins and the user';
COMMENT ON COLUMN anonymous_picks.submitted_at IS 'Timestamp when the anonymous pick set was submitted';