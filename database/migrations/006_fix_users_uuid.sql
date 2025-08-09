-- Migration to fix users table UUID generation
-- Run this in your Supabase SQL editor

-- First, check if users table exists and has proper structure
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    leaguesafe_email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Ensure the id column has a proper UUID default if it exists but doesn't have one
DO $$ 
BEGIN
    -- Check if the id column exists but doesn't have a default
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'id' 
        AND column_default IS NULL
    ) THEN
        ALTER TABLE public.users 
        ALTER COLUMN id SET DEFAULT gen_random_uuid();
    END IF;
END $$;

-- Ensure proper constraints and indexes exist
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_leaguesafe_email ON public.users(leaguesafe_email);
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON public.users(is_admin);

-- Enable RLS if not already enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to recreate them
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can manage users" ON public.users;

-- Create RLS policies
CREATE POLICY "Users can view their own data" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON public.users
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() AND users.is_admin = true
        )
    );

CREATE POLICY "Admins can manage users" ON public.users
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() AND users.is_admin = true
        )
    );

-- Create or replace function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;

-- Create trigger for automatic updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_users_updated_at();

-- Add helpful comments
COMMENT ON TABLE public.users IS 'User accounts for the Pigskin Pick Six application';
COMMENT ON COLUMN public.users.id IS 'Unique UUID identifier for each user';
COMMENT ON COLUMN public.users.email IS 'User email address (unique)';
COMMENT ON COLUMN public.users.display_name IS 'Display name for the user';
COMMENT ON COLUMN public.users.is_admin IS 'Whether the user has admin privileges';
COMMENT ON COLUMN public.users.leaguesafe_email IS 'Email from LeagueSafe for matching purposes';