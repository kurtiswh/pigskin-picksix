-- Migration 080: Disable problematic triggers causing statement timeouts
-- 
-- Issue: Games table updates are timing out due to expensive trigger operations
-- Root cause: recalculate_pick_points_trigger does complex CROSS JOIN LATERAL operations
-- Solution: Disable trigger since application handles pick calculations via scoreCalculation.ts

BEGIN;

-- Drop the problematic trigger that causes statement timeouts on games table updates
DROP TRIGGER IF EXISTS recalculate_pick_points_trigger ON public.games;

-- Drop the trigger function as well since it's no longer needed
-- (application handles pick calculations via scoreCalculation.ts service)
DROP FUNCTION IF EXISTS recalculate_pick_points_on_game_update();

-- Keep the basic game scoring trigger for winner_against_spread calculation
-- This one is lightweight and needed for basic game data
-- DROP TRIGGER IF EXISTS update_game_winner_scoring_trigger ON public.games; -- Keep this one

-- Keep the pick statistics trigger as it's optimized and safe
-- DROP TRIGGER IF EXISTS update_pick_stats_on_game_completion_safe_trigger ON public.games; -- Keep this one

-- Add a comment explaining the change
COMMENT ON TABLE public.games IS 'Game table - pick calculations now handled by application scoreCalculation.ts service, not database triggers';

-- Log the change
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 080: Disabled expensive recalculate_pick_points_trigger';
    RAISE NOTICE '✅ Games table updates should no longer timeout';
    RAISE NOTICE '✅ Pick calculations handled by application scoreCalculation.ts service';
END;
$$;

COMMIT;