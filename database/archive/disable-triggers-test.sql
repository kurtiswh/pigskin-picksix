-- TEMPORARY: Disable potentially problematic triggers for testing
-- Run this to test if triggers are causing the slowdown
-- You can re-enable them later if needed

-- Disable the expensive triggers temporarily
ALTER TABLE public.games DISABLE TRIGGER calculate_pick_results_trigger;
ALTER TABLE public.picks DISABLE TRIGGER validate_pick_constraints_trigger;

-- Test query after disabling triggers
SELECT 'After disabling triggers' as test_phase, COUNT(*) as game_count FROM public.games;

-- Re-enable triggers (run this after testing)
-- ALTER TABLE public.games ENABLE TRIGGER calculate_pick_results_trigger;
-- ALTER TABLE public.picks ENABLE TRIGGER validate_pick_constraints_trigger;