-- Recalculate All Completed Games for Week 14 Season 2024
--
-- PURPOSE: Fix any games that were scored using the old incorrect function
-- CONTEXT: Migration 144 dropped calculate_game_winner_and_bonus() which used wrong tolerance logic
--
-- This script re-processes all completed games using the correct function:
-- calculate_and_update_completed_game() from migration 140

DO $$
DECLARE
    game_rec RECORD;
    result_rec RECORD;
    total_games INTEGER := 0;
    successful_games INTEGER := 0;
    failed_games INTEGER := 0;
BEGIN
    RAISE NOTICE '🔄 RECALCULATING WEEK 14 2024 COMPLETED GAMES';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Using correct function: calculate_and_update_completed_game()';
    RAISE NOTICE '';

    -- Get all completed games for week 14 season 2024
    FOR game_rec IN
        SELECT id, home_team, away_team, home_score, away_score, spread, winner_against_spread
        FROM public.games
        WHERE season = 2024
          AND week = 14
          AND status = 'completed'
        ORDER BY home_team
    LOOP
        total_games := total_games + 1;

        RAISE NOTICE '';
        RAISE NOTICE '🏈 Game %: % @ % (%-%, spread %)',
            total_games, game_rec.away_team, game_rec.home_team,
            game_rec.away_score, game_rec.home_score, game_rec.spread;
        RAISE NOTICE '   Current winner: %', game_rec.winner_against_spread;

        -- Call the correct scoring function
        BEGIN
            SELECT * INTO result_rec
            FROM calculate_and_update_completed_game(game_rec.id);

            IF result_rec.success THEN
                successful_games := successful_games + 1;
                RAISE NOTICE '   ✅ Recalculated: winner=%, bonus=%, picks=%',
                    result_rec.winner,
                    result_rec.margin_bonus,
                    result_rec.picks_updated + result_rec.anonymous_picks_updated;
            ELSE
                failed_games := failed_games + 1;
                RAISE WARNING '   ❌ Failed: %', result_rec.error_message;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            failed_games := failed_games + 1;
            RAISE WARNING '   ❌ Exception: %', SQLERRM;
        END;
    END LOOP;

    RAISE NOTICE '';
    RAISE NOTICE '================================================';
    RAISE NOTICE '✅ RECALCULATION COMPLETE';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Results:';
    RAISE NOTICE '   Total games: %', total_games;
    RAISE NOTICE '   Successful: %', successful_games;
    RAISE NOTICE '   Failed: %', failed_games;
    RAISE NOTICE '';

    IF failed_games > 0 THEN
        RAISE WARNING '⚠️  Some games failed to recalculate - check errors above';
    ELSE
        RAISE NOTICE '🎉 All games recalculated successfully!';
    END IF;
    RAISE NOTICE '';
END;
$$;
