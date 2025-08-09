-- Migration to absolutely ensure UUID generation works
-- This completely removes reliance on database-side UUID generation

-- Drop the existing default constraint
ALTER TABLE public.users ALTER COLUMN id DROP DEFAULT;

-- Remove the NOT NULL constraint temporarily 
-- (we'll handle this in the application)
ALTER TABLE public.users ALTER COLUMN id SET NOT NULL;

-- Add a comment explaining that IDs must be provided by the application
COMMENT ON COLUMN public.users.id IS 'UUID must be provided by application - no database default';

-- Verify the change
SELECT column_name, column_default, is_nullable, data_type 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'id';