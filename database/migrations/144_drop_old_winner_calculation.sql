-- Migration 144: Drop Old Incorrect Winner Calculation Function
--
-- PROBLEM: Migration 114 created calculate_game_winner_and_bonus() with WRONG logic:
--   - Uses tolerance-based comparison: ABS(margin) < 0.5 for push detection
--   - This causes incorrect winner calculations (e.g., Georgia vs Georgia Tech)
--
-- SOLUTION: Migration 140 created the CORRECT function calculate_and_update_completed_game()
--   - Uses exact comparison logic
--   - Properly handles spread calculations
--
-- ACTION: Drop the old incorrect function to prevent it from being called

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 144: DROP OLD INCORRECT WINNER CALCULATION';
    RAISE NOTICE '========================================================';
    RAISE NOTICE 'PROBLEM: calculate_game_winner_and_bonus() uses wrong tolerance logic';
    RAISE NOTICE 'FIX: Drop old function, ensure only calculate_and_update_completed_game() is used';
    RAISE NOTICE '';
END;
$$;

-- Drop the old incorrect function from migration 114
DROP FUNCTION IF EXISTS public.calculate_game_winner_and_bonus(UUID, INTEGER, INTEGER, DECIMAL);

-- Verify the correct function exists
DO $$
DECLARE
    correct_function_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'calculate_and_update_completed_game'
    ) INTO correct_function_exists;

    IF correct_function_exists THEN
        RAISE NOTICE '✅ Correct function calculate_and_update_completed_game() exists';
    ELSE
        RAISE WARNING '⚠️  Correct function calculate_and_update_completed_game() NOT FOUND!';
        RAISE EXCEPTION 'Migration 140 must be applied before migration 144';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 144 COMPLETED!';
    RAISE NOTICE '';
    RAISE NOTICE '📊 WINNER CALCULATION:';
    RAISE NOTICE '• ONLY function: calculate_and_update_completed_game(game_id)';
    RAISE NOTICE '• Uses exact comparison (no tolerance)';
    RAISE NOTICE '• Automatically processes picks after winner calculation';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  NEXT STEPS:';
    RAISE NOTICE '• Recalculate any games scored with old function';
    RAISE NOTICE '• Verify Edge Function calls correct function';
    RAISE NOTICE '';
END;
$$;
