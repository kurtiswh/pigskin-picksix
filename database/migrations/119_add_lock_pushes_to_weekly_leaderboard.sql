-- Migration 119: Add lock_pushes column to weekly_leaderboard table
-- Date: 2025-09-03
-- Description: Add lock_pushes column to track lock pick pushes

-- Add the lock_pushes column to the weekly_leaderboard table
ALTER TABLE public.weekly_leaderboard 
ADD COLUMN IF NOT EXISTS lock_pushes INTEGER DEFAULT 0;

-- Update existing records to calculate lock_pushes based on pick results
-- This will populate lock_pushes for existing data
UPDATE public.weekly_leaderboard 
SET lock_pushes = (
    SELECT COUNT(*)
    FROM public.picks p
    WHERE p.user_id = weekly_leaderboard.user_id
      AND p.week = weekly_leaderboard.week
      AND p.season = weekly_leaderboard.season
      AND p.is_lock = true
      AND p.result = 'push'
);

-- Also check anonymous_picks table if it exists
UPDATE public.weekly_leaderboard 
SET lock_pushes = lock_pushes + (
    SELECT COALESCE(COUNT(*), 0)
    FROM public.anonymous_picks ap
    WHERE ap.game_id IN (
        SELECT id FROM public.games g 
        WHERE g.week = weekly_leaderboard.week 
          AND g.season = weekly_leaderboard.season
    )
    AND ap.is_lock = true
    AND ap.result = 'push'
    AND ap.assigned_user_id = weekly_leaderboard.user_id
);