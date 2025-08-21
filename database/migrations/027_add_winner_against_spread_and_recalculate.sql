-- Add winner against spread column and recalculate all points
-- This migration adds clarity to who won against the spread and ensures consistent scoring

-- Add winner_against_spread column to games table
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS winner_against_spread TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.games.winner_against_spread IS 'Team that won against the spread: home team name, away team name, or "push"';

-- Create function to determine winner against the spread
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

-- Create comprehensive function to calculate pick points using current scoring method
CREATE OR REPLACE FUNCTION calculate_comprehensive_pick_points(
    selected_team TEXT,
    is_lock BOOLEAN,
    home_team TEXT,
    away_team TEXT,
    home_score INTEGER,
    away_score INTEGER,
    spread NUMERIC,
    winner_against_spread TEXT
)
RETURNS TABLE(
    result TEXT,
    points_earned INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    base_points INTEGER := 0;
    margin NUMERIC := 0;
    bonus_points INTEGER := 0;
    total_points INTEGER := 0;
    pick_result TEXT := 'loss';
BEGIN
    -- Return 0 points if game not completed
    IF home_score IS NULL OR away_score IS NULL OR winner_against_spread IS NULL THEN
        RETURN QUERY SELECT 'loss'::TEXT, 0;
        RETURN;
    END IF;
    
    -- Determine if pick was correct
    IF winner_against_spread = 'push' THEN
        pick_result := 'push';
        base_points := 10;
        bonus_points := 0;
    ELSIF selected_team = winner_against_spread THEN
        pick_result := 'win';
        base_points := 20;
        
        -- Calculate margin for bonus points
        -- Margin is how much the winning team beat the spread by
        IF selected_team = home_team THEN
            -- Home team won, calculate by how much they beat the spread
            margin := (home_score + spread) - away_score;
        ELSE
            -- Away team won, calculate by how much they beat the spread  
            margin := away_score - (home_score + spread);
        END IF;
        
        -- Award bonus based on margin ranges
        IF margin >= 29 THEN
            bonus_points := 5;
        ELSIF margin >= 20 THEN
            bonus_points := 3;
        ELSIF margin >= 11 THEN
            bonus_points := 1;
        ELSE
            bonus_points := 0;
        END IF;
    ELSE
        pick_result := 'loss';
        base_points := 0;
        bonus_points := 0;
    END IF;
    
    -- Calculate total points (lock picks double the bonus, not the base)
    IF is_lock THEN
        total_points := base_points + (bonus_points * 2);
    ELSE
        total_points := base_points + bonus_points;
    END IF;
    
    RETURN QUERY SELECT pick_result, total_points;
END;
$$;

-- Update all completed games with winner against spread
UPDATE public.games 
SET winner_against_spread = calculate_winner_against_spread(
    home_team, away_team, home_score, away_score, spread
)
WHERE status = 'completed' AND home_score IS NOT NULL AND away_score IS NOT NULL;

-- Create a temporary table to store recalculated pick results
CREATE TEMP TABLE temp_pick_calculations AS
SELECT 
    p.id as pick_id,
    calc.*
FROM public.picks p
JOIN public.games g ON p.game_id = g.id
CROSS JOIN LATERAL calculate_comprehensive_pick_points(
    p.selected_team,
    p.is_lock,
    g.home_team,
    g.away_team,
    g.home_score,
    g.away_score,
    g.spread,
    g.winner_against_spread
) calc
WHERE g.status = 'completed';

-- Update picks table with recalculated points and results
UPDATE public.picks 
SET 
    result = temp_calc.result::pick_result,
    points_earned = temp_calc.points_earned
FROM temp_pick_calculations temp_calc
WHERE picks.id = temp_calc.pick_id;

-- Update games table margin bonus using the corrected calculation
UPDATE public.games 
SET margin_bonus = CASE 
    WHEN winner_against_spread = 'push' OR winner_against_spread IS NULL THEN 0
    WHEN winner_against_spread = home_team THEN
        CASE 
            WHEN (home_score + spread - away_score) >= 29 THEN 5
            WHEN (home_score + spread - away_score) >= 20 THEN 3  
            WHEN (home_score + spread - away_score) >= 11 THEN 1
            ELSE 0
        END
    WHEN winner_against_spread = away_team THEN
        CASE 
            WHEN (away_score - home_score - spread) >= 29 THEN 5
            WHEN (away_score - home_score - spread) >= 20 THEN 3
            WHEN (away_score - home_score - spread) >= 11 THEN 1  
            ELSE 0
        END
    ELSE 0
END
WHERE status = 'completed' AND home_score IS NOT NULL AND away_score IS NOT NULL;

-- Create trigger to automatically update winner_against_spread when game scores change
CREATE OR REPLACE FUNCTION update_game_winner_against_spread()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update winner against spread when scores change
    NEW.winner_against_spread := calculate_winner_against_spread(
        NEW.home_team, NEW.away_team, NEW.home_score, NEW.away_score, NEW.spread
    );
    
    -- Also update margin bonus
    IF NEW.winner_against_spread = 'push' OR NEW.winner_against_spread IS NULL THEN
        NEW.margin_bonus := 0;
    ELSIF NEW.winner_against_spread = NEW.home_team THEN
        NEW.margin_bonus := CASE 
            WHEN (NEW.home_score + NEW.spread - NEW.away_score) >= 29 THEN 5
            WHEN (NEW.home_score + NEW.spread - NEW.away_score) >= 20 THEN 3  
            WHEN (NEW.home_score + NEW.spread - NEW.away_score) >= 11 THEN 1
            ELSE 0
        END;
    ELSIF NEW.winner_against_spread = NEW.away_team THEN
        NEW.margin_bonus := CASE 
            WHEN (NEW.away_score - NEW.home_score - NEW.spread) >= 29 THEN 5
            WHEN (NEW.away_score - NEW.home_score - NEW.spread) >= 20 THEN 3
            WHEN (NEW.away_score - NEW.home_score - NEW.spread) >= 11 THEN 1  
            ELSE 0
        END;
    ELSE
        NEW.margin_bonus := 0;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Replace the existing trigger with our comprehensive one
DROP TRIGGER IF EXISTS update_game_scoring_trigger ON public.games;
CREATE TRIGGER update_game_winner_scoring_trigger
    BEFORE UPDATE ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION update_game_winner_against_spread();

-- Create trigger function to recalculate pick points when game results change
CREATE OR REPLACE FUNCTION recalculate_pick_points_on_game_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only recalculate if the game status changed to completed or scores changed
    IF (OLD.status != 'completed' AND NEW.status = 'completed') OR 
       (OLD.home_score IS DISTINCT FROM NEW.home_score) OR 
       (OLD.away_score IS DISTINCT FROM NEW.away_score) THEN
        
        -- Update all picks for this game with recalculated points
        UPDATE public.picks 
        SET 
            result = calc.result::pick_result,
            points_earned = calc.points_earned
        FROM public.picks p
        CROSS JOIN LATERAL calculate_comprehensive_pick_points(
            p.selected_team,
            p.is_lock,
            NEW.home_team,
            NEW.away_team,
            NEW.home_score,
            NEW.away_score,
            NEW.spread,
            NEW.winner_against_spread
        ) calc
        WHERE picks.game_id = NEW.id AND picks.id = p.id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger to automatically recalculate pick points when games are updated
DROP TRIGGER IF EXISTS calculate_pick_results_trigger ON public.games;
CREATE TRIGGER recalculate_pick_points_trigger
    AFTER UPDATE ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION recalculate_pick_points_on_game_update();

-- Create index for performance on the new column
CREATE INDEX IF NOT EXISTS idx_games_winner_against_spread ON public.games(winner_against_spread);

-- Add some helpful queries for verification
DO $$
BEGIN
    RAISE NOTICE 'Migration completed successfully!';
    RAISE NOTICE 'Total games updated with winner_against_spread: %', 
        (SELECT COUNT(*) FROM public.games WHERE winner_against_spread IS NOT NULL);
    RAISE NOTICE 'Total picks updated with recalculated points: %',
        (SELECT COUNT(*) FROM public.picks WHERE points_earned IS NOT NULL);
    RAISE NOTICE 'Sample games with winners against spread:';
END $$;

-- Show sample of games with winner against spread (for verification)
SELECT 
    home_team || ' vs ' || away_team as matchup,
    home_score || '-' || away_score as final_score,
    spread,
    winner_against_spread,
    margin_bonus
FROM public.games 
WHERE winner_against_spread IS NOT NULL 
ORDER BY updated_at DESC 
LIMIT 5;