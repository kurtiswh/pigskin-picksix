-- Migration to add custom_lock_time column to games table
-- Run this in your Supabase SQL editor

-- Add the custom lock time column
ALTER TABLE public.games 
ADD COLUMN custom_lock_time TIMESTAMP WITH TIME ZONE;

-- Add comment for documentation
COMMENT ON COLUMN public.games.custom_lock_time IS 'Custom lock time for this specific game (overrides default calculation)';