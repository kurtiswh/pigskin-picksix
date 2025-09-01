-- Migration 091: EMERGENCY - Disable ultra-minimal trigger that's still causing timeout
-- 
-- DISCOVERY: Even ultra-minimal trigger (that just sets api_completed=true) causes timeout
-- PROBLEM: There must be competing processes or infrastructure issues
-- SOLUTION: Disable ALL triggers again and test direct updates

BEGIN;

-- Disable the ultra-minimal trigger that's still timing out
DROP TRIGGER IF EXISTS update_game_completion_ultra_minimal_trigger ON public.games;

-- Make sure ALL triggers are disabled
DROP TRIGGER IF EXISTS update_game_scoring_minimal_trigger ON public.games;
DROP TRIGGER IF EXISTS update_game_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS update_picks_after_completion_trigger ON public.games;

-- Verify we're back to NO TRIGGERS state
COMMENT ON TABLE public.games IS 
    'EMERGENCY: ALL triggers disabled again after ultra-minimal trigger also timed out - testing infrastructure issue theory';

-- Log the emergency disable
DO $$
BEGIN
    RAISE NOTICE '🚨 Migration 091: EMERGENCY DISABLE ULTRA-MINIMAL TRIGGER';
    RAISE NOTICE '❌ update_game_completion_ultra_minimal_trigger -> DISABLED (was timing out)';
    RAISE NOTICE '❌ ALL other triggers -> CONFIRMED DISABLED';
    RAISE NOTICE '🔍 THEORY: Issue is competing processes, not trigger complexity';
    RAISE NOTICE '🧪 TEST: Direct status updates should work without timeout';
    RAISE NOTICE '💡 Root cause may be: live update service conflicts, row locks, or infrastructure';
END;
$$;

COMMIT;