-- Combined Migrations 121 & 122: Admin Leaderboard Visibility Controls
-- Copy and paste this entire content into your Supabase SQL Editor

-- =====================================================
-- Migration 121: Add Admin Leaderboard Visibility Controls
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 121: Add admin leaderboard visibility controls';
    RAISE NOTICE '===============================================================';
END;
$$;

-- Step 1: Add show_on_leaderboard column to picks table
ALTER TABLE public.picks 
ADD COLUMN IF NOT EXISTS show_on_leaderboard BOOLEAN DEFAULT TRUE;

-- Step 2: Add index for performance
CREATE INDEX IF NOT EXISTS idx_picks_show_on_leaderboard 
ON public.picks(show_on_leaderboard);

-- Note: Migration 121 contains many functions - let me read the full content and include it