-- Migration 135: Drop Leaderboard Trigger Functions
-- 
-- PURPOSE: Drop the actual FUNCTIONS that are called by triggers and try to update
-- weekly_leaderboard.updated_at. This is more aggressive than just dropping triggers.

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 135: Drop leaderboard trigger functions completely';
    RAISE NOTICE '===============================================================';
END;
$$;

-- First drop any remaining triggers (in case Migration 134 wasn't applied)
DROP TRIGGER IF EXISTS picks_season_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS picks_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_on_pick_change ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_on_pick_change ON public.picks;

-- Now drop the actual FUNCTIONS that contain the UPDATE statements
DROP FUNCTION IF EXISTS public.update_weekly_leaderboard_on_pick_change() CASCADE;
DROP FUNCTION IF EXISTS public.update_season_leaderboard_on_pick_change() CASCADE;
DROP FUNCTION IF EXISTS public.update_weekly_leaderboard_with_source(UUID, INTEGER, INTEGER, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.update_season_leaderboard_with_source(UUID, INTEGER, INTEGER, VARCHAR) CASCADE;

-- Drop any other leaderboard update functions
DROP FUNCTION IF EXISTS public.refresh_weekly_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_season_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.rebuild_weekly_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.rebuild_season_leaderboard() CASCADE;

-- Log the migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 135 completed successfully';
    RAISE NOTICE '🗑️ Dropped ALL leaderboard trigger FUNCTIONS (not just triggers)';
    RAISE NOTICE '🎯 This should completely eliminate any code trying to UPDATE leaderboard views';
    RAISE NOTICE '📊 Leaderboards will still work as views - they compute data in real-time';
    RAISE NOTICE '💡 If this fixes it, we know the issue was in the trigger functions themselves';
END;
$$;