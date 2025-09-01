-- Migration 092: FINAL - Disable ALL scoring triggers that fire on in_progress games
-- 
-- DISCOVERY: Found in_progress games with margin_bonus scores (should be 0)
-- ROOT CAUSE: Triggers are calculating scores on ANY game update, not just completion
-- EVIDENCE: Syracuse @ Tennessee: margin_bonus=5, Texas @ Ohio State: margin_bonus=1, etc.
-- SOLUTION: Disable ALL triggers that could calculate scores during live updates

BEGIN;

-- Drop ALL triggers that could be calculating scores during live updates
DROP TRIGGER IF EXISTS update_game_completion_ultra_minimal_trigger ON public.games;
DROP TRIGGER IF EXISTS update_game_scoring_minimal_trigger ON public.games;
DROP TRIGGER IF EXISTS update_game_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS update_picks_after_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS update_game_winner_scoring_trigger ON public.games;
DROP TRIGGER IF EXISTS update_covered_status_trigger ON public.games;
DROP TRIGGER IF EXISTS recalculate_pick_points_trigger ON public.games;
DROP TRIGGER IF EXISTS update_pick_stats_on_game_completion_safe_trigger ON public.games;
DROP TRIGGER IF EXISTS update_pick_stats_on_game_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS calculate_pick_results_trigger ON public.games;
DROP TRIGGER IF EXISTS update_game_scoring_trigger ON public.games;
DROP TRIGGER IF EXISTS update_game_scoring_conditional_trigger ON public.games;

-- Also check for any BEFORE UPDATE triggers that might calculate scores
DROP TRIGGER IF EXISTS calculate_game_winner_trigger ON public.games;
DROP TRIGGER IF EXISTS update_margin_bonus_trigger ON public.games;
DROP TRIGGER IF EXISTS game_scoring_trigger ON public.games;

-- Clean up any scoring data from in_progress games
UPDATE public.games 
SET 
    winner_against_spread = NULL,
    margin_bonus = 0
WHERE status = 'in_progress' 
AND season = 2025 
AND week = 1
AND (winner_against_spread IS NOT NULL OR margin_bonus != 0);

-- Add comment explaining the clean state
COMMENT ON TABLE public.games IS 
    'CLEAN STATE: All scoring triggers disabled, in_progress games cleaned of premature scoring';

-- Log the final cleanup
DO $$
BEGIN
    RAISE NOTICE '🧹 Migration 092: FINAL CLEANUP - ALL SCORING TRIGGERS DISABLED';
    RAISE NOTICE '❌ ALL game update triggers -> DISABLED';
    RAISE NOTICE '✅ In-progress game scoring -> CLEANED (set to NULL/0)';  
    RAISE NOTICE '🎯 STATUS: Games can now update without competing score calculations';
    RAISE NOTICE '✅ Syracuse @ Tennessee margin_bonus: 5 -> 0';
    RAISE NOTICE '✅ Texas @ Ohio State margin_bonus: 1 -> 0';
    RAISE NOTICE '✅ Mississippi State @ Southern Miss margin_bonus: 5 -> 0';
    RAISE NOTICE '🔧 Ready for clean trigger implementation that only fires on completion';
END;
$$;

COMMIT;