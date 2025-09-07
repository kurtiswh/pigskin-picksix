-- Migration 120: Fix Pick Results for Non-Completed Games
-- Clear pick results for games that aren't actually completed

CREATE OR REPLACE FUNCTION fix_picks_for_incomplete_games(
    season_param INTEGER DEFAULT 2025,
    week_param INTEGER DEFAULT NULL
)
RETURNS TABLE(
    games_checked INTEGER,
    games_cleared INTEGER,
    picks_cleared INTEGER,
    anonymous_picks_cleared INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    checked_count INTEGER := 0;
    cleared_games_count INTEGER := 0;
    cleared_picks_count INTEGER := 0;
    cleared_anon_picks_count INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
    game_rec RECORD;
    target_week INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔧 FIXING PICKS FOR INCOMPLETE GAMES';
    RAISE NOTICE '==================================';
    RAISE NOTICE '';
    
    -- Determine week to process
    IF week_param IS NULL THEN
        -- Use active week
        SELECT week INTO target_week
        FROM week_settings
        WHERE picks_open = true
        ORDER BY week DESC
        LIMIT 1;
        
        IF NOT FOUND THEN
            RAISE NOTICE '❌ No active week found and no week specified';
            RETURN QUERY SELECT 0, 0, 0, 0, ARRAY['No active week found']::TEXT[];
            RETURN;
        END IF;
    ELSE
        target_week := week_param;
    END IF;
    
    RAISE NOTICE '🎯 Processing Season % Week %', season_param, target_week;
    RAISE NOTICE '';
    
    -- Process each game that is NOT completed but has pick results
    FOR game_rec IN 
        SELECT g.id, g.home_team, g.away_team, g.status, g.winner_against_spread,
               COUNT(p.id) as pick_count,
               COUNT(ap.id) as anon_pick_count
        FROM games g
        LEFT JOIN picks p ON g.id = p.game_id AND p.result IS NOT NULL
        LEFT JOIN anonymous_picks ap ON g.id = ap.game_id AND ap.result IS NOT NULL
        WHERE g.season = season_param 
        AND g.week = target_week
        AND g.status != 'completed'
        AND (p.id IS NOT NULL OR ap.id IS NOT NULL)
        GROUP BY g.id, g.home_team, g.away_team, g.status, g.winner_against_spread
    LOOP
        checked_count := checked_count + 1;
        
        RAISE NOTICE '🚨 Found incomplete game with pick results:';
        RAISE NOTICE '   Game: % @ % (Status: %)', game_rec.away_team, game_rec.home_team, game_rec.status;
        RAISE NOTICE '   Winner: %, Picks: %, Anonymous: %', 
            game_rec.winner_against_spread, game_rec.pick_count, game_rec.anon_pick_count;
        
        DECLARE
            picks_updated INTEGER;
            anon_picks_updated INTEGER;
        BEGIN
            -- Clear pick results for this game
            UPDATE picks 
            SET result = NULL,
                points_earned = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE game_id = game_rec.id 
            AND result IS NOT NULL;
            
            GET DIAGNOSTICS picks_updated = ROW_COUNT;
            cleared_picks_count := cleared_picks_count + picks_updated;
            
            -- Clear anonymous pick results for this game
            UPDATE anonymous_picks
            SET result = NULL,
                points_earned = NULL,
                updated_at = CURRENT_TIMESTAMP  
            WHERE game_id = game_rec.id
            AND result IS NOT NULL;
            
            GET DIAGNOSTICS anon_picks_updated = ROW_COUNT;
            cleared_anon_picks_count := cleared_anon_picks_count + anon_picks_updated;
            
            -- Clear game winner data if it exists
            IF game_rec.winner_against_spread IS NOT NULL THEN
                UPDATE games
                SET winner_against_spread = NULL,
                    margin_bonus = NULL,
                    base_points = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = game_rec.id;
                
                RAISE NOTICE '   ✅ Cleared game winner data';
            END IF;
            
            cleared_games_count := cleared_games_count + 1;
            RAISE NOTICE '   ✅ Cleared % picks and % anonymous picks', 
                picks_updated, anon_picks_updated;
            
        EXCEPTION
            WHEN OTHERS THEN
                error_list := array_append(error_list, 
                    'Error fixing ' || game_rec.home_team || ': ' || SQLERRM);
                RAISE NOTICE '   ❌ Error: %', SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '📊 FINAL RESULTS:';
    RAISE NOTICE '   Games checked: %', checked_count;
    RAISE NOTICE '   Games cleared: %', cleared_games_count;  
    RAISE NOTICE '   Picks cleared: %', cleared_picks_count;
    RAISE NOTICE '   Anonymous picks cleared: %', cleared_anon_picks_count;
    RAISE NOTICE '   Errors: %', array_length(error_list, 1);
    RAISE NOTICE '';
    RAISE NOTICE '✅ PICK CLEANUP COMPLETE!';
    
    RETURN QUERY SELECT checked_count, cleared_games_count, cleared_picks_count, 
                        cleared_anon_picks_count, error_list;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Pick cleanup failed: %', SQLERRM;
        RETURN QUERY SELECT checked_count, cleared_games_count, cleared_picks_count,
                           cleared_anon_picks_count, ARRAY[SQLERRM]::TEXT[];
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION fix_picks_for_incomplete_games(INTEGER, INTEGER) TO authenticated;

-- Also create a simple version that just uses current active week
CREATE OR REPLACE FUNCTION fix_picks_for_incomplete_games()
RETURNS TABLE(
    games_checked INTEGER,
    games_cleared INTEGER,
    picks_cleared INTEGER,
    anonymous_picks_cleared INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY SELECT * FROM fix_picks_for_incomplete_games(2025, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION fix_picks_for_incomplete_games() TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ PICK CLEANUP FUNCTION CREATED!';
    RAISE NOTICE '=================================';
    RAISE NOTICE '';
    RAISE NOTICE '🛠️ USAGE:';
    RAISE NOTICE '• fix_picks_for_incomplete_games() - Fix active week';
    RAISE NOTICE '• fix_picks_for_incomplete_games(2025, 2) - Fix specific season/week';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 WHAT IT DOES:';
    RAISE NOTICE '• Finds games that are NOT completed but have pick results';
    RAISE NOTICE '• Clears result and points_earned for both picks and anonymous_picks';
    RAISE NOTICE '• Clears winner_against_spread and related data from games table';
    RAISE NOTICE '• Provides detailed logging of what was fixed';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Ready to clean up incorrect pick results!';
END;
$$;