-- Migration 082: Disable remaining expensive triggers causing statement timeouts
-- 
-- Issue: Games table updates still timing out (57014) after disabling recalculate_pick_points_trigger
-- Root cause: Other triggers are still executing expensive operations
-- Solution: Temporarily disable pick statistics and coverage calculation triggers

BEGIN;

-- Drop the pick statistics trigger that's causing complex queries on game completion
-- This trigger executes expensive CTE queries with EXISTS subqueries and COUNT aggregations
DROP TRIGGER IF EXISTS update_pick_stats_on_game_completion_safe_trigger ON public.games;

-- Drop the covered status trigger that may also be doing expensive calculations
DROP TRIGGER IF EXISTS update_covered_status_trigger ON public.games;

-- Keep only the essential winner_against_spread trigger (lightweight calculation)
-- This one just calculates which team won ATS based on score and spread
-- DROP TRIGGER IF EXISTS update_game_winner_scoring_trigger ON public.games; -- Keep this lightweight one

-- Add comment explaining the temporary change
COMMENT ON TABLE public.games IS 
    'Temporarily disabled expensive triggers during game updates. Pick statistics and coverage status can be calculated separately.';

-- Create a manual function to update pick statistics when needed
-- This allows controlled execution without blocking live game updates
CREATE OR REPLACE FUNCTION public.manual_update_pick_statistics_for_completed_games()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- This function can be called manually to update pick statistics
    -- for completed games without blocking live updates
    
    -- Update statistics for recently completed games
    PERFORM public.calculate_game_pick_statistics_safe(id)
    FROM public.games 
    WHERE status = 'completed' 
    AND (pick_stats_updated_at IS NULL OR pick_stats_updated_at < updated_at)
    LIMIT 10; -- Process in batches to avoid timeout
    
    RAISE NOTICE 'Updated pick statistics for completed games';
END;
$$;

-- Log the change
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 082: Disabled expensive game update triggers';
    RAISE NOTICE '✅ update_pick_stats_on_game_completion_safe_trigger -> DISABLED';
    RAISE NOTICE '✅ update_covered_status_trigger -> DISABLED';
    RAISE NOTICE '✅ Games table updates should no longer timeout';
    RAISE NOTICE '✅ Use manual_update_pick_statistics_for_completed_games() for statistics updates';
END;
$$;

COMMIT;