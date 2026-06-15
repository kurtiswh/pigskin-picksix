-- Fix Alabama @ Florida State Regular Picks Scoring
-- The calculate_pick_results function has bugs - this is a manual fix

-- First, let's check the game data
DO $$
DECLARE
    game_record RECORD;
    picks_count INTEGER;
BEGIN
    -- Get the game data
    SELECT * INTO game_record 
    FROM public.games 
    WHERE id = 'e7bc11a3-8922-4264-964b-b1d1b6a4f0fe';
    
    RAISE NOTICE 'Game: % @ % (Final: % - %)', 
        game_record.away_team, game_record.home_team, 
        game_record.away_score, game_record.home_score;
    RAISE NOTICE 'Spread: %, Winner ATS: %, Margin Bonus: %', 
        game_record.spread, game_record.winner_against_spread, game_record.margin_bonus;
    
    -- Count unscored picks
    SELECT COUNT(*) INTO picks_count
    FROM public.picks 
    WHERE game_id = 'e7bc11a3-8922-4264-964b-b1d1b6a4f0fe' 
    AND result IS NULL;
    
    RAISE NOTICE 'Unscored regular picks: %', picks_count;
END $$;

-- Now update the regular picks with correct scoring logic
-- Alabama @ Florida State: Both teams won ATS (both get 20 points + margin bonus)
UPDATE public.picks
SET 
    result = CASE 
        WHEN selected_team IN ('Alabama', 'Florida State') THEN 'win'
        ELSE 'loss'
    END,
    points_earned = CASE 
        WHEN selected_team IN ('Alabama', 'Florida State') THEN 
            -- Base 20 points for win + margin bonus (3 points) + lock bonus if applicable
            20 + COALESCE((SELECT margin_bonus FROM games WHERE id = 'e7bc11a3-8922-4264-964b-b1d1b6a4f0fe'), 0) +
            CASE WHEN is_lock THEN COALESCE((SELECT margin_bonus FROM games WHERE id = 'e7bc11a3-8922-4264-964b-b1d1b6a4f0fe'), 0) ELSE 0 END
        ELSE 0
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = 'e7bc11a3-8922-4264-964b-b1d1b6a4f0fe' 
AND result IS NULL;

-- Report results
DO $$
DECLARE
    updated_count INTEGER;
    sample_pick RECORD;
BEGIN
    -- Count updated picks
    SELECT COUNT(*) INTO updated_count
    FROM public.picks 
    WHERE game_id = 'e7bc11a3-8922-4264-964b-b1d1b6a4f0fe' 
    AND result IS NOT NULL;
    
    RAISE NOTICE '✅ Updated % regular picks for Alabama @ Florida State', updated_count;
    
    -- Show a sample
    SELECT selected_team, is_lock, result, points_earned INTO sample_pick
    FROM public.picks 
    WHERE game_id = 'e7bc11a3-8922-4264-964b-b1d1b6a4f0fe' 
    AND result IS NOT NULL
    LIMIT 1;
    
    IF FOUND THEN
        RAISE NOTICE 'Sample pick: % = % (% points)%', 
            sample_pick.selected_team, sample_pick.result, sample_pick.points_earned,
            CASE WHEN sample_pick.is_lock THEN ' [LOCK]' ELSE '' END;
    END IF;
END $$;