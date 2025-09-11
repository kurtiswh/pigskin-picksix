-- Migration 133: Drop Orphaned Leaderboard Triggers
-- 
-- PURPOSE: Remove triggers that were created when season_leaderboard and weekly_leaderboard
-- were tables (Migration 028), but are now causing errors since they're views again (Migration 131)

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 133: Drop orphaned leaderboard triggers';
    RAISE NOTICE '===============================================================';
END;
$$;

-- Drop triggers that reference season_leaderboard and weekly_leaderboard
-- These were created in Migration 028 but not cleaned up in Migration 131

-- Drop season_leaderboard trigger
DROP TRIGGER IF EXISTS update_season_leaderboard_updated_at ON public.season_leaderboard;

-- Drop weekly_leaderboard trigger  
DROP TRIGGER IF EXISTS update_weekly_leaderboard_updated_at ON public.weekly_leaderboard;

-- Also drop the picks triggers that try to update leaderboard tables (now views)
-- These were created in migrations 036/037 and cause errors when picks are created
DROP TRIGGER IF EXISTS picks_season_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS picks_weekly_leaderboard_trigger ON public.picks;

-- Log the migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 133 completed successfully';
    RAISE NOTICE '🗑️ Dropped orphaned triggers that were causing pick creation failures';
    RAISE NOTICE '📝 season_leaderboard and weekly_leaderboard are now properly functioning as views';
    RAISE NOTICE '🎯 Pick creation should now work without leaderboard update errors';
    RAISE NOTICE '🔧 Also dropped picks triggers that tried to update leaderboard tables';
END;
$$;