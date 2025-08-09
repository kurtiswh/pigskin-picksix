-- Migration to add leaguesafe_email column to users table
-- Run this in your Supabase SQL editor

-- Add the leaguesafe_email column if it doesn't exist
DO $$ 
BEGIN
    -- Check if column exists before adding it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'leaguesafe_email'
    ) THEN
        ALTER TABLE public.users 
        ADD COLUMN leaguesafe_email TEXT;
        
        -- Add comment for documentation
        COMMENT ON COLUMN public.users.leaguesafe_email IS 'Email address from LeagueSafe CSV for matching purposes';
    END IF;
END $$;