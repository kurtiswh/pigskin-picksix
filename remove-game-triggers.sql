-- SQL Script to Remove Problematic Game Completion Triggers
-- Run this in your Supabase SQL Editor to fix the timeout issues

-- Step 1: Drop all problematic triggers that cause timeouts
DROP TRIGGER IF EXISTS process_picks_on_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS process_picks_notification_trigger ON public.games;
DROP TRIGGER IF EXISTS process_picks_safe_trigger ON public.games;
DROP TRIGGER IF EXISTS update_picks_after_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS handle_game_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS handle_game_completion_only_trigger ON public.games;
DROP TRIGGER IF EXISTS handle_game_completion_scoring_trigger ON public.games;
DROP TRIGGER IF EXISTS update_pick_statistics_trigger ON public.games;
DROP TRIGGER IF EXISTS calculate_game_winner_trigger ON public.games;
DROP TRIGGER IF EXISTS auto_calculate_winner_trigger ON public.games;
DROP TRIGGER IF EXISTS game_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS picks_scoring_trigger ON public.games;
DROP TRIGGER IF EXISTS recalculate_pick_points_trigger ON public.games;
DROP TRIGGER IF EXISTS update_pick_stats_on_game_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS update_pick_stats_on_game_completion_safe_trigger ON public.games;

-- Step 2: Keep only essential non-blocking triggers
-- The updated_at trigger should remain for audit purposes

-- Step 3: Verify triggers are removed
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'games' 
  AND trigger_schema = 'public'
ORDER BY trigger_name;

-- Expected result: Should only show updated_at trigger (if any)

-- Step 4: Add a comment for future reference
COMMENT ON TABLE public.games IS 'Game completion triggers removed to prevent timeouts. Logic moved to liveUpdateService.ts';

SELECT 'Triggers removed successfully! You can now retry the game updates.' as status;