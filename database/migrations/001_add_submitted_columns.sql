-- Migration to add submitted and submitted_at columns to picks table
-- Run this in your Supabase SQL editor

-- Add the new columns
ALTER TABLE public.picks 
ADD COLUMN submitted BOOLEAN DEFAULT FALSE,
ADD COLUMN submitted_at TIMESTAMP WITH TIME ZONE;

-- Update existing picks to have submitted = false (default is already false, but being explicit)
UPDATE public.picks SET submitted = FALSE WHERE submitted IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.picks.submitted IS 'Whether the user has officially submitted their picks for the week';
COMMENT ON COLUMN public.picks.submitted_at IS 'Timestamp when the picks were submitted';