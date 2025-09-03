-- Migration 116: Force Recalculate All Game Statistics Using Existing Functions
-- 
-- PURPOSE: Use existing calculate_game_statistics function to overwrite current game stats
-- CONTEXT: Force recalculation of all games using whatever logic is currently live

DO $$
BEGIN
    RAISE NOTICE '🔄 Migration 116: Force recalculating all games using existing functions';
    RAISE NOTICE '====================================================================';
END;
$$;

-- Function to force recalculate all games using existing calculate_game_statistics function
CREATE OR REPLACE FUNCTION force_recalculate_using_existing_functions()
RETURNS TABLE(
    games_processed INTEGER,
    games_updated INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    game_rec RECORD;
    total_games INTEGER := 0;
    updated_games INTEGER := 0;
    old_winner TEXT;
    old_bonus INTEGER;
    result_rec RECORD;
BEGIN
    RAISE NOTICE '🎯 Starting forced recalculation using existing calculate_game_statistics function...';
    
    -- Process ALL completed games with scores
    FOR game_rec IN 
        SELECT * FROM public.games 
        WHERE status = 'completed'
        AND home_score IS NOT NULL 
        AND away_score IS NOT NULL
        ORDER BY season DESC, week DESC
    LOOP
        total_games := total_games + 1;
        old_winner := game_rec.winner_against_spread;
        old_bonus := game_rec.margin_bonus;
        
        -- Use the existing calculate_game_statistics function (from Migration 109)
        BEGIN
            SELECT * INTO result_rec FROM calculate_game_statistics(game_rec.id);
            
            IF result_rec.game_updated THEN
                updated_games := updated_games + 1;
                
                -- Get the updated game to see what changed
                SELECT winner_against_spread, margin_bonus INTO game_rec.winner_against_spread, game_rec.margin_bonus
                FROM public.games WHERE id = game_rec.id;
                
                -- Log any changes
                IF old_winner != game_rec.winner_against_spread OR old_bonus != game_rec.margin_bonus THEN
                    RAISE NOTICE '  UPDATED: %s @ %s (Week % %): winner % → %, bonus % → %', 
                        game_rec.away_team, game_rec.home_team, 
                        game_rec.week, game_rec.season,
                        old_winner, game_rec.winner_against_spread,
                        old_bonus, game_rec.margin_bonus;
                END IF;
            ELSE
                RAISE NOTICE '  SKIPPED: %s @ %s - %', 
                    game_rec.away_team, game_rec.home_team, result_rec.operation_status;
            END IF;
            
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE '  ERROR: %s @ %s - %', 
                    game_rec.away_team, game_rec.home_team, SQLERRM;
        END;
        
        -- Progress logging every 50 games
        IF total_games % 50 = 0 THEN
            RAISE NOTICE '  Processed % games...', total_games;
        END IF;
    END LOOP;
    
    RAISE NOTICE '✅ Force recalculation completed: % games processed, % games updated', 
        total_games, updated_games;
    
    RETURN QUERY SELECT total_games, updated_games, 
        format('Successfully processed %s games using existing functions, %s updated', total_games, updated_games);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error in force recalculation: %', SQLERRM;
        RETURN QUERY SELECT 0, 0, format('Error: %s', SQLERRM);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION force_recalculate_using_existing_functions() TO authenticated;

-- Add function documentation
COMMENT ON FUNCTION force_recalculate_using_existing_functions() IS 
'Force recalculate ALL completed games using existing calculate_game_statistics function';

-- Execute the forced recalculation using existing functions
SELECT * FROM force_recalculate_using_existing_functions();

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 116 COMPLETED - All games recalculated using existing functions!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 WHAT HAPPENED:';
    RAISE NOTICE '• Used existing calculate_game_statistics() function from Migration 109';
    RAISE NOTICE '• Forced recalculation of ALL completed games';
    RAISE NOTICE '• Overwrote existing winner_against_spread and margin_bonus values';
    RAISE NOTICE '• Logged all games where values actually changed';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️ NEXT STEPS:';
    RAISE NOTICE '• Check output above for which games were updated';
    RAISE NOTICE '• Verify margin_bonus values are now correct';
    RAISE NOTICE '• Run picks recalculation if needed';
END;
$$;