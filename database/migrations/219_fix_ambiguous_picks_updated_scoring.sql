-- Migration 219: completed games scored zero picks -- ambiguous picks_updated
--
-- calculate_and_update_completed_game computed the game winner correctly and
-- then died on `column reference "picks_updated" is ambiguous`: its own
-- RETURNS TABLE declares picks_updated, and the inner SELECT reads a column
-- of the same name from process_picks_for_completed_game. The EXCEPTION
-- handler demoted that to a WARNING and returned success=true with 0 picks
-- processed, so the first completed game of 2026 (Colorado @ Georgia Tech)
-- got a winner and no scored picks, silently. Alias the inner relation.

CREATE OR REPLACE FUNCTION public.calculate_and_update_completed_game(game_id_param uuid)
 RETURNS TABLE(winner text, margin_bonus integer, base_points integer, picks_updated integer, anonymous_picks_updated integer, success boolean, error_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  PERFORM public.assert_admin_or_server();
        -- Alias required: the enclosing RETURNS TABLE also declares
        -- picks_updated / anonymous_picks_updated, and PL/pgSQL resolves the
        -- bare names ambiguously (42702). That exception was swallowed by the
        -- handler below, so every completed game reported success while
        -- scoring zero picks.
        SELECT ppg.picks_updated, ppg.anonymous_picks_updated
        INTO picks_count, anon_count
        FROM process_picks_for_completed_game(game_id_param) AS ppg;

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
$function$

;

-- Second swallowed failure, one layer down: process_picks_for_completed_game's
-- anonymous_picks WHERE clause compared the enum result to an UNCAST text CASE
-- ('win'/'push'/'loss'), which has no pick_result != text operator. The
-- function's own exception handler reduced that to a WARNING -- and since both
-- UPDATEs share the function's transaction, the already-applied regular-picks
-- update rolled back with it. Net effect: winner calculated, zero picks of
-- either kind scored, success reported.

CREATE OR REPLACE FUNCTION public.process_picks_for_completed_game(game_id_param uuid)
 RETURNS TABLE(picks_updated integer, anonymous_picks_updated integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    game_rec RECORD;
    picks_count INTEGER := 0;
    anon_picks_count INTEGER := 0;
BEGIN
  PERFORM public.assert_admin_or_server();
    RAISE NOTICE '🎯 Processing picks for completed game: %', game_id_param;
    
    -- Get the completed game data
    SELECT * INTO game_rec 
    FROM public.games 
    WHERE id = game_id_param AND status = 'completed';
    
    IF NOT FOUND THEN
        RAISE WARNING 'Game % not found or not completed', game_id_param;
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;
    
    IF game_rec.winner_against_spread IS NULL THEN
        RAISE WARNING 'Game % completed but winner_against_spread not calculated', game_id_param;
        RETURN QUERY SELECT 0, 0;
        RETURN;
    END IF;
    
    RAISE NOTICE '  Game: % @ % (% - %), Winner: %, Bonus: %', 
        game_rec.away_team, game_rec.home_team,
        game_rec.away_score, game_rec.home_score,
        game_rec.winner_against_spread, game_rec.margin_bonus;
    
    -- Update regular picks
    UPDATE public.picks
    SET 
        result = CASE 
            WHEN selected_team = game_rec.winner_against_spread THEN 'win'::pick_result
            WHEN game_rec.winner_against_spread = 'push' THEN 'push'::pick_result
            ELSE 'loss'::pick_result
        END,
        points_earned = CASE 
            WHEN selected_team = game_rec.winner_against_spread THEN 
                20 + COALESCE(game_rec.margin_bonus, 0) + 
                CASE WHEN is_lock THEN COALESCE(game_rec.margin_bonus, 0) ELSE 0 END
            WHEN game_rec.winner_against_spread = 'push' THEN 10
            ELSE 0
        END,
        updated_at = CURRENT_TIMESTAMP
    WHERE game_id = game_id_param 
    AND (result IS NULL OR result != CASE 
        WHEN selected_team = game_rec.winner_against_spread THEN 'win'::pick_result
        WHEN game_rec.winner_against_spread = 'push' THEN 'push'::pick_result
        ELSE 'loss'::pick_result
    END);
    
    GET DIAGNOSTICS picks_count = ROW_COUNT;
    
    -- Update anonymous picks
    UPDATE public.anonymous_picks
    SET 
        result = CASE 
            WHEN selected_team = game_rec.winner_against_spread THEN 'win'::pick_result
            WHEN game_rec.winner_against_spread = 'push' THEN 'push'::pick_result
            ELSE 'loss'::pick_result
        END,
        points_earned = CASE 
            WHEN selected_team = game_rec.winner_against_spread THEN 
                20 + COALESCE(game_rec.margin_bonus, 0) + 
                CASE WHEN is_lock THEN COALESCE(game_rec.margin_bonus, 0) ELSE 0 END
            WHEN game_rec.winner_against_spread = 'push' THEN 10
            ELSE 0
        END
    WHERE game_id = game_id_param 
    AND (result IS NULL OR result != CASE 
        -- Casts required: bare literals make this CASE resolve to text, and
        -- pick_result != text has no operator (42883). The exception handler
        -- turned that into a WARNING and rolled back BOTH updates, so no
        -- pick of either kind was ever scored.
        WHEN selected_team = game_rec.winner_against_spread THEN 'win'::pick_result
        WHEN game_rec.winner_against_spread = 'push' THEN 'push'::pick_result
        ELSE 'loss'::pick_result
    END);
    
    GET DIAGNOSTICS anon_picks_count = ROW_COUNT;
    
    RAISE NOTICE '✅ Updated % picks and % anonymous picks', picks_count, anon_picks_count;
    
    RETURN QUERY SELECT picks_count, anon_picks_count;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error processing picks for game %: %', game_id_param, SQLERRM;
        RETURN QUERY SELECT 0, 0;
END;
$function$

;
