-- Migration 086: Restore missing calculate_winner_against_spread function
-- 
-- ISSUE: Migration 075 "NUCLEAR OPTION" eliminated spread calculations
-- PROBLEM: Function calculate_winner_against_spread was removed but Migration 085 needs it
-- ERROR: "function calculate_winner_against_spread(text, text, integer, integer, numeric) does not exist"
-- SOLUTION: Restore the function from Migration 027

BEGIN;

-- Restore the calculate_winner_against_spread function (from Migration 027)
CREATE OR REPLACE FUNCTION calculate_winner_against_spread(
    home_team TEXT,
    away_team TEXT,
    home_score INTEGER,
    away_score INTEGER,
    spread NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    home_score_with_spread NUMERIC;
BEGIN
    -- Return null if game not completed
    IF home_score IS NULL OR away_score IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Calculate home team score with spread applied
    home_score_with_spread := home_score + spread;
    
    -- Determine winner against spread
    IF home_score_with_spread > away_score THEN
        RETURN home_team;
    ELSIF away_score > home_score_with_spread THEN
        RETURN away_team;
    ELSE
        RETURN 'push';
    END IF;
END;
$$;

-- Also restore the calculate_comprehensive_pick_points function that may be needed
CREATE OR REPLACE FUNCTION calculate_comprehensive_pick_points(
    selected_team TEXT,
    is_lock BOOLEAN,
    home_team TEXT,
    away_team TEXT,
    home_score INTEGER,
    away_score INTEGER,
    spread NUMERIC,
    base_points INTEGER DEFAULT 10,
    margin_bonus INTEGER DEFAULT 0
)
RETURNS TABLE(
    result pick_result,
    points_earned INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    winner_ats TEXT;
    pick_result pick_result;
    pick_points INTEGER;
BEGIN
    -- Calculate winner against spread
    winner_ats := calculate_winner_against_spread(home_team, away_team, home_score, away_score, spread);
    
    -- Determine pick result
    IF winner_ats IS NULL THEN
        pick_result := NULL;
        pick_points := NULL;
    ELSIF selected_team = winner_ats THEN
        pick_result := 'win';
        pick_points := base_points + margin_bonus + CASE WHEN is_lock THEN margin_bonus ELSE 0 END;
    ELSIF winner_ats = 'push' THEN
        pick_result := 'push';
        pick_points := 10; -- Push always gets 10 points
    ELSE
        pick_result := 'loss';
        pick_points := 0;
    END IF;
    
    RETURN QUERY SELECT pick_result, pick_points;
END;
$$;

-- Test the restored function works
DO $$
DECLARE
    test_result TEXT;
BEGIN
    -- Test the function with sample data
    test_result := calculate_winner_against_spread('Home Team', 'Away Team', 21, 17, -3.5);
    
    IF test_result IS NOT NULL THEN
        RAISE NOTICE '✅ Function calculate_winner_against_spread restored successfully';
        RAISE NOTICE '✅ Test result: %', test_result;
    ELSE
        RAISE NOTICE '❌ Function test failed';
    END IF;
END;
$$;

-- Add explanatory comment
COMMENT ON FUNCTION calculate_winner_against_spread IS 
    'Restored function to calculate which team won against the spread. Needed for game completion triggers.';

-- Log the restoration
DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 086: RESTORED MISSING FUNCTIONS';
    RAISE NOTICE '✅ calculate_winner_against_spread() -> RESTORED';
    RAISE NOTICE '✅ calculate_comprehensive_pick_points() -> RESTORED';
    RAISE NOTICE '✅ Migration 085 triggers should now work correctly';
    RAISE NOTICE '🚀 Game completion should now work without function errors!';
END;
$$;

COMMIT;