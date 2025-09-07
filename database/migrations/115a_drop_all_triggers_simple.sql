-- Migration 115a: Drop All Problematic Triggers (Simple Version)
-- This migration removes all triggers that could cause deadlocks

-- Drop ALL completion-related triggers that could interfere
DROP TRIGGER IF EXISTS handle_game_completion_only_trigger ON public.games CASCADE;
DROP TRIGGER IF EXISTS handle_game_completion_scoring_trigger ON public.games CASCADE; 
DROP TRIGGER IF EXISTS process_picks_notification_trigger ON public.games CASCADE;
DROP TRIGGER IF EXISTS process_picks_safe_trigger ON public.games CASCADE;
DROP TRIGGER IF EXISTS handle_game_completion_trigger ON public.games CASCADE;
DROP TRIGGER IF EXISTS update_pick_statistics_trigger ON public.games CASCADE;
DROP TRIGGER IF EXISTS calculate_game_winner_trigger ON public.games CASCADE;
DROP TRIGGER IF EXISTS auto_calculate_winner_trigger ON public.games CASCADE;
DROP TRIGGER IF EXISTS game_completion_trigger ON public.games CASCADE;
DROP TRIGGER IF EXISTS picks_scoring_trigger ON public.games CASCADE;

-- Drop ALL leaderboard triggers that could cause constraint violations
DROP TRIGGER IF EXISTS refresh_leaderboards_on_pick_change ON public.picks CASCADE;
DROP TRIGGER IF EXISTS update_leaderboard_on_pick_insert ON public.picks CASCADE;
DROP TRIGGER IF EXISTS update_leaderboard_on_pick_update ON public.picks CASCADE;
DROP TRIGGER IF EXISTS refresh_season_leaderboard_trigger ON public.picks CASCADE;
DROP TRIGGER IF EXISTS refresh_weekly_leaderboard_trigger ON public.picks CASCADE;

-- Drop corresponding functions
DROP FUNCTION IF EXISTS handle_game_completion_only() CASCADE;
DROP FUNCTION IF EXISTS handle_game_completion_scoring_only() CASCADE;
DROP FUNCTION IF EXISTS process_picks_after_completion() CASCADE;
DROP FUNCTION IF EXISTS process_picks_safe_after_completion() CASCADE;
DROP FUNCTION IF EXISTS calculate_game_winner() CASCADE;
DROP FUNCTION IF EXISTS auto_calculate_winner() CASCADE;
DROP FUNCTION IF EXISTS update_pick_statistics() CASCADE;
DROP FUNCTION IF EXISTS refresh_leaderboards_on_pick_change() CASCADE;
DROP FUNCTION IF EXISTS update_leaderboard_on_pick_change() CASCADE;

-- Keep only essential timestamp triggers
-- (update_games_updated_at, update_picks_updated_at, etc. remain)