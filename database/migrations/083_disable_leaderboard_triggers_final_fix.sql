-- Migration 083: Disable remaining leaderboard triggers causing game completion deadlocks
-- 
-- ROOT CAUSE: Leaderboard triggers on picks table create competing transactions
-- ISSUE: When games.status changes to 'completed':
--   1. Live Update Service tries to update games.status = 'completed'
--   2. Pick Processing (scoreCalculation.ts) updates many picks via calculatePicksForGame()
--   3. Each pick update fires expensive leaderboard recalculation triggers
--   4. Multiple concurrent transactions compete for same database resources
--   5. Original games.status update gets blocked/times out (deadlock)
-- SOLUTION: Disable expensive triggers and use manual leaderboard updates

BEGIN;

-- Drop the leaderboard triggers that fire on EVERY picks table change
-- These cause expensive recalculations that compete with game completion updates
DROP TRIGGER IF EXISTS update_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_trigger ON public.picks;

-- Also drop any leaderboard triggers on anonymous_picks that might cause similar issues
DROP TRIGGER IF EXISTS update_weekly_leaderboard_anon_trigger ON public.anonymous_picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_anon_trigger ON public.anonymous_picks;

-- Keep only the anonymous pick assignment trigger as it's needed for functionality
-- DROP TRIGGER IF EXISTS handle_anonymous_pick_assignment_trigger ON public.anonymous_picks; -- Keep this one

-- Create manual function to update leaderboards when needed (without blocking live updates)
CREATE OR REPLACE FUNCTION public.manual_update_leaderboards_for_completed_games()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- This function can be called manually or on a schedule
    -- to update leaderboards without blocking live game updates
    
    -- Update weekly leaderboards for completed games
    PERFORM public.recalculate_weekly_leaderboard()
    FROM public.games 
    WHERE status = 'completed' 
    AND updated_at > NOW() - INTERVAL '1 hour' -- Only recently completed games
    LIMIT 5; -- Process in small batches
    
    -- Update season leaderboards for completed games  
    PERFORM public.recalculate_season_leaderboard()
    FROM public.games 
    WHERE status = 'completed'
    AND updated_at > NOW() - INTERVAL '1 hour' -- Only recently completed games
    LIMIT 5; -- Process in small batches
    
    RAISE NOTICE 'Updated leaderboards for recently completed games';
END;
$$;

-- Add explanatory comment
COMMENT ON TABLE public.picks IS 
    'Picks table - leaderboard triggers disabled to prevent deadlocks during game completion. Use manual_update_leaderboards_for_completed_games() for updates.';

-- Log the critical fix
DO $$
BEGIN
    RAISE NOTICE '🎯 Migration 083: FINAL FIX - Disabled leaderboard triggers causing deadlocks';
    RAISE NOTICE '❌ update_weekly_leaderboard_trigger -> DISABLED (was causing competition)';
    RAISE NOTICE '❌ update_season_leaderboard_trigger -> DISABLED (was causing competition)';
    RAISE NOTICE '✅ Games.status=completed updates should no longer deadlock';
    RAISE NOTICE '✅ Pick processing will work without triggering expensive operations'; 
    RAISE NOTICE '✅ Use manual_update_leaderboards_for_completed_games() for leaderboard updates';
    RAISE NOTICE '🚀 This should resolve the core issue preventing game completion';
END;
$$;

COMMIT;