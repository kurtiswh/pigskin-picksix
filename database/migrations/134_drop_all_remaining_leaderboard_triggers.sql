-- Migration 134: Drop ALL Remaining Leaderboard Triggers
-- 
-- PURPOSE: Remove all triggers that try to update weekly_leaderboard and season_leaderboard
-- which are now views (Migration 131) and don't have updated_at columns

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 134: Drop ALL remaining leaderboard triggers';
    RAISE NOTICE '===============================================================';
END;
$$;

-- Drop ALL triggers that might be trying to update leaderboard tables (now views)

-- Triggers on picks table that update leaderboards
DROP TRIGGER IF EXISTS picks_season_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS picks_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_on_pick_change ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_on_pick_change ON public.picks;

-- Triggers directly on leaderboard tables (now views)
DROP TRIGGER IF EXISTS update_season_leaderboard_updated_at ON public.season_leaderboard;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_updated_at ON public.weekly_leaderboard;

-- Any anonymous picks triggers that might also be causing issues
DROP TRIGGER IF EXISTS update_weekly_leaderboard_anon_trigger ON public.anonymous_picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_anon_trigger ON public.anonymous_picks;

-- Log the migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 134 completed successfully';
    RAISE NOTICE '🗑️ Dropped ALL leaderboard-related triggers that were causing errors';
    RAISE NOTICE '📝 Leaderboards now function purely as views (computed dynamically)';
    RAISE NOTICE '🎯 Pick creation and submission should now work without ANY leaderboard errors';
    RAISE NOTICE '⚡ Leaderboards will still work - they are computed from picks data in real-time';
END;
$$;