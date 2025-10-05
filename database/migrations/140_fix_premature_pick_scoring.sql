-- Migration 140: Fix Premature Pick Scoring - Only Score Completed Games
--
-- PROBLEM: Picks are being scored for in-progress games showing incorrect results
-- ROOT CAUSE: calculate_and_update_completed_game() only checked if scores exist,
--             NOT if game status = 'completed'
-- RESULT: In-progress games with scores get winners calculated and picks scored
-- FIX: Add game status check to ensure ONLY completed games are processed

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 140: FIX PREMATURE PICK SCORING';
    RAISE NOTICE '========================================================';
    RAISE NOTICE 'PROBLEM: In-progress games showing scores (e.g. 10 points for "push")';
    RAISE NOTICE 'CAUSE: Function processes any game with scores, not just completed';
    RAISE NOTICE 'FIX: Add status = ''completed'' check before scoring';
    RAISE NOTICE '';
END;
$$;

-- Update the function to add the critical status check
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
    RAISE NOTICE '🎯 [SCORING] Processing game: %', game_id_param;

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

    -- ============================================================================
    -- CRITICAL FIX: Only process COMPLETED games
    -- This prevents scoring picks for in-progress or scheduled games
    -- ============================================================================
    IF game_rec.status != 'completed' THEN
        RAISE NOTICE '⏭️  Game % not completed yet (status: %), skipping scoring',
            game_id_param, game_rec.status;
        RETURN QUERY SELECT
            NULL::TEXT, 0, 0, 0, 0, false,
            format('Game not completed yet (status: %s)', game_rec.status)::TEXT;
        RETURN;
    END IF;

    RAISE NOTICE '✅ Game % is completed, proceeding with scoring', game_id_param;

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

-- Ensure permissions are granted
GRANT EXECUTE ON FUNCTION calculate_and_update_completed_game(UUID) TO authenticated, service_role;

-- Verification
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 140 COMPLETED!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 CHANGES MADE:';
    RAISE NOTICE '• Added game status = ''completed'' check (line 59-68)';
    RAISE NOTICE '• Function now REFUSES to score in-progress or scheduled games';
    RAISE NOTICE '• Picks will only be scored when game is actually completed';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 EXPECTED BEHAVIOR:';
    RAISE NOTICE '• In-progress games: Function returns error "Game not completed yet"';
    RAISE NOTICE '• Completed games: Function calculates winner and scores picks';
    RAISE NOTICE '• Picks table: result/points_earned stay NULL until game completes';
    RAISE NOTICE '';
    RAISE NOTICE '📊 TESTING:';
    RAISE NOTICE 'Try scoring an in-progress game - it should be rejected:';
    RAISE NOTICE 'SELECT * FROM calculate_and_update_completed_game(''in-progress-game-id'');';
    RAISE NOTICE 'Expected: success = false, error_message = "Game not completed yet"';
    RAISE NOTICE '';
    RAISE NOTICE '✅ FIX DEPLOYED: In-progress games will no longer show incorrect scores!';
END;
$$;
