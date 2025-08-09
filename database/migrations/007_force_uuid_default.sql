-- Migration to force UUID default on users table
-- Run this in your Supabase SQL editor

-- First, let's see the current structure and fix it
DO $$ 
BEGIN
    -- Force set the default on the id column
    EXECUTE 'ALTER TABLE public.users ALTER COLUMN id SET DEFAULT gen_random_uuid()';
    RAISE NOTICE 'Set UUID default on users.id column';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error setting UUID default: %', SQLERRM;
END $$;

-- Alternative: If the above doesn't work, we may need to recreate the constraint
-- Let's also ensure the uuid-ossp extension is enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Try alternative UUID function if gen_random_uuid doesn't work
DO $$ 
BEGIN
    -- Try with uuid_generate_v4() as fallback
    EXECUTE 'ALTER TABLE public.users ALTER COLUMN id SET DEFAULT uuid_generate_v4()';
    RAISE NOTICE 'Set UUID default using uuid_generate_v4()';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'uuid_generate_v4() also failed: %', SQLERRM;
END $$;

-- Let's check what the current default is
DO $$
DECLARE
    current_default TEXT;
BEGIN
    SELECT column_default INTO current_default
    FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'id';
    
    RAISE NOTICE 'Current default for users.id: %', COALESCE(current_default, 'NULL');
END $$;