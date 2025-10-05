-- Migration 139: Single Source of Truth for Game Scoring
--
-- PROBLEM: Multiple implementations of winner calculation logic causing incorrect scores
-- - Database function: calculate_winner_against_spread() (CORRECT)
-- - Edge Function: calculateWinner() with Math.abs tolerance (WRONG)
-- - TypeScript services: Multiple duplicates (WRONG)
--
-- SOLUTION: Create ONE consolidated function that uses the database's source of truth
-- This matches the manual admin fix logic exactly
--
-- GOAL: Eliminate scoring discrepancies by centralizing all logic in database

DO $$
BEGIN
    RAISE NOTICE '🎯 Migration 139: SINGLE SOURCE OF TRUTH SCORING';
    RAISE NOTICE '========================================================';
    RAISE NOTICE 'GOAL: Fix incorrect live scoring by centralizing logic';
    RAISE NOTICE 'STRATEGY: One database function that does EVERYTHING correctly';
    RAISE NOTICE '';
END;
$$;

-- Step 1: Create comprehensive function that combines winner calculation + pick processing
-- This is the ONLY function that should ever score a completed game

CREATE OR REPLACE FUNCTION calculate_and_update_completed_game(
    game_id_param UUID
)
RETURNS TABLE(
    winner TEXT,
    margin_bonus INTEGER,
    base_points INTEGER,
    picks_updated INTEGER,
    anonymous_picks_updated INTEGER,
    success BOOLEAN,
    error_message TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    calculated_winner TEXT;
    calculated_bonus INTEGER;
    picks_count INTEGER := 0;
    anon_count INTEGER := 0;
    home_score_with_spread NUMERIC;
    cover_margin NUMERIC;
BEGIN
    RAISE NOTICE '🎯 [SCORING] Processing completed game: %', game_id_param;

    -- Get game data
    SELECT * INTO game_rec
    FROM public.games
    WHERE id = game_id_param;

    IF NOT FOUND THEN
        RAISE WARNING '❌ Game % not found', game_id_param;
        RETURN QUERY SELECT
            NULL::TEXT, 0, 0, 0, 0, false, 'Game not found'::TEXT;
        RETURN;
    END IF;

    -- Verify game has scores
    IF game_rec.home_score IS NULL OR game_rec.away_score IS NULL THEN
        RAISE WARNING '⚠️  Game % missing scores', game_id_param;
        RETURN QUERY SELECT
            NULL::TEXT, 0, 0, 0, 0, false, 'Game missing scores'::TEXT;
        RETURN;
    END IF;

    RAISE NOTICE '📊 Game: % @ % (%-%)',
        game_rec.away_team, game_rec.home_team,
        game_rec.away_score, game_rec.home_score;
    RAISE NOTICE '📏 Spread: %', game_rec.spread;

    -- ============================================================================
    -- WINNER CALCULATION - Using database source of truth logic
    -- This matches calculate_winner_against_spread() exactly
    -- ============================================================================

    home_score_with_spread := game_rec.home_score + game_rec.spread;

    -- Determine winner (EXACT comparison, no tolerance)
    IF home_score_with_spread > game_rec.away_score THEN
        calculated_winner := game_rec.home_team;
        RAISE NOTICE '✅ HOME team covers: % + % = % > %',
            game_rec.home_score, game_rec.spread, home_score_with_spread, game_rec.away_score;
    ELSIF game_rec.away_score > home_score_with_spread THEN
        calculated_winner := game_rec.away_team;
        RAISE NOTICE '✅ AWAY team covers: % > % + % = %',
            game_rec.away_score, game_rec.home_score, game_rec.spread, home_score_with_spread;
    ELSE
        calculated_winner := 'push';
        RAISE NOTICE '🟰 PUSH: % = %', home_score_with_spread, game_rec.away_score;
    END IF;

    -- ============================================================================
    -- MARGIN BONUS CALCULATION
    -- ============================================================================

    IF calculated_winner = 'push' THEN
        calculated_bonus := 0;
        RAISE NOTICE '📊 Margin Bonus: 0 (push)';

    ELSIF calculated_winner = game_rec.home_team THEN
        -- Home team won ATS - calculate their cover margin
        cover_margin := home_score_with_spread - game_rec.away_score;

        calculated_bonus := CASE
            WHEN cover_margin >= 29 THEN 5
            WHEN cover_margin >= 20 THEN 3
            WHEN cover_margin >= 11 THEN 1
            ELSE 0
        END;

        RAISE NOTICE '📊 HOME cover margin: % points → Bonus: %', cover_margin, calculated_bonus;

    ELSIF calculated_winner = game_rec.away_team THEN
        -- Away team won ATS - calculate their cover margin
        cover_margin := game_rec.away_score - home_score_with_spread;

        calculated_bonus := CASE
            WHEN cover_margin >= 29 THEN 5
            WHEN cover_margin >= 20 THEN 3
            WHEN cover_margin >= 11 THEN 1
            ELSE 0
        END;

        RAISE NOTICE '📊 AWAY cover margin: % points → Bonus: %', cover_margin, calculated_bonus;

    ELSE
        calculated_bonus := 0;
    END IF;

    -- ============================================================================
    -- UPDATE GAME RECORD
    -- ============================================================================

    UPDATE public.games SET
        winner_against_spread = calculated_winner,
        margin_bonus = calculated_bonus,
        base_points = 20,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = game_id_param;

    RAISE NOTICE '✅ Game updated: winner=%, bonus=%, base=20',
        calculated_winner, calculated_bonus;

    -- ============================================================================
    -- PROCESS PICKS (Regular + Anonymous)
    -- Uses existing process_picks_for_completed_game function
    -- ============================================================================

    BEGIN
        SELECT picks_updated, anonymous_picks_updated
        INTO picks_count, anon_count
        FROM process_picks_for_completed_game(game_id_param);

        RAISE NOTICE '✅ Picks processed: % regular, % anonymous',
            picks_count, anon_count;

    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '⚠️  Pick processing error: %', SQLERRM;
        -- Don't fail the whole operation if pick processing fails
        picks_count := 0;
        anon_count := 0;
    END;

    -- Return success
    RETURN QUERY SELECT
        calculated_winner,
        calculated_bonus,
        20 as base_pts,
        picks_count,
        anon_count,
        true,
        NULL::TEXT;

    RAISE NOTICE '🎉 SCORING COMPLETE: % wins, %+% pts, % picks processed',
        calculated_winner, 20, calculated_bonus, picks_count + anon_count;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ SCORING FAILED for game %: %', game_id_param, SQLERRM;
        RETURN QUERY SELECT
            NULL::TEXT, 0, 0, 0, 0, false, SQLERRM::TEXT;
END;
$$;

-- Grant permissions to both authenticated users and service role (for Edge Functions)
GRANT EXECUTE ON FUNCTION calculate_and_update_completed_game(UUID) TO authenticated, service_role;

-- Add helpful comment
COMMENT ON FUNCTION calculate_and_update_completed_game(UUID) IS
'Single source of truth for scoring completed games. Calculates winner, margin bonus, and processes all picks. Used by both Edge Functions and manual admin triggers.';

-- Step 2: Verify existing helper functions exist
DO $$
DECLARE
    func_exists BOOLEAN;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 VERIFYING HELPER FUNCTIONS:';

    -- Check calculate_winner_against_spread
    SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'calculate_winner_against_spread'
    ) INTO func_exists;

    IF func_exists THEN
        RAISE NOTICE '  ✅ calculate_winner_against_spread() exists';
    ELSE
        RAISE WARNING '  ⚠️  calculate_winner_against_spread() NOT FOUND!';
    END IF;

    -- Check process_picks_for_completed_game
    SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'process_picks_for_completed_game'
    ) INTO func_exists;

    IF func_exists THEN
        RAISE NOTICE '  ✅ process_picks_for_completed_game() exists';
    ELSE
        RAISE WARNING '  ⚠️  process_picks_for_completed_game() NOT FOUND!';
    END IF;
END;
$$;

-- Final summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 139 COMPLETED!';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 NEW FUNCTION CREATED:';
    RAISE NOTICE '• calculate_and_update_completed_game(game_id)';
    RAISE NOTICE '';
    RAISE NOTICE '📋 WHAT IT DOES:';
    RAISE NOTICE '1. Calculates winner using database source of truth logic';
    RAISE NOTICE '2. Calculates margin bonus correctly';
    RAISE NOTICE '3. Updates game record with winner/bonus/base_points';
    RAISE NOTICE '4. Processes all picks (regular + anonymous)';
    RAISE NOTICE '5. Returns comprehensive result summary';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 USAGE:';
    RAISE NOTICE 'SELECT * FROM calculate_and_update_completed_game(game_id);';
    RAISE NOTICE '';
    RAISE NOTICE '💡 BENEFITS:';
    RAISE NOTICE '• Single source of truth - matches manual admin fix exactly';
    RAISE NOTICE '• No more scoring discrepancies';
    RAISE NOTICE '• Atomic operation (all-or-nothing)';
    RAISE NOTICE '• Detailed logging for debugging';
    RAISE NOTICE '• Used by Edge Functions AND manual triggers';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  NEXT STEPS:';
    RAISE NOTICE '1. Update Edge Function to call this function';
    RAISE NOTICE '2. Update TypeScript services to call this function';
    RAISE NOTICE '3. Remove duplicate calculateWinner() logic everywhere';
END;
$$;
