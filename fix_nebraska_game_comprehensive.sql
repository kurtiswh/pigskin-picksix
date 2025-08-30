-- Comprehensive fix for the home_covered column issue and game status update
-- Run these commands in Supabase Dashboard > SQL Editor in this exact order

-- Step 1: First, drop the problematic trigger temporarily
DROP TRIGGER IF EXISTS calculate_pick_results_trigger ON games;

-- Step 2: Add the missing columns
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS home_covered BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS away_covered BOOLEAN DEFAULT NULL;

-- Step 3: Update the problematic function to handle the new columns properly
CREATE OR REPLACE FUNCTION calculate_pick_results()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Calculate home_covered and away_covered based on winner_against_spread
    NEW.home_covered := CASE 
        WHEN NEW.winner_against_spread IS NULL THEN NULL
        WHEN NEW.winner_against_spread = 'push' THEN TRUE
        WHEN NEW.winner_against_spread = NEW.home_team THEN TRUE
        ELSE FALSE
    END;
    
    NEW.away_covered := CASE 
        WHEN NEW.winner_against_spread IS NULL THEN NULL
        WHEN NEW.winner_against_spread = 'push' THEN TRUE
        WHEN NEW.winner_against_spread = NEW.away_team THEN TRUE
        ELSE FALSE
    END;
    
    -- Only update picks if the game is completed
    IF NEW.status = 'completed' AND NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN
        UPDATE public.picks
        SET
            result = CASE
                WHEN (NEW.home_score + NEW.spread) = NEW.away_score THEN 'push'::pick_result
                WHEN (selected_team = NEW.home_team AND NEW.home_covered)
                  OR (selected_team = NEW.away_team AND NEW.away_covered) THEN 'win'::pick_result
                ELSE 'loss'::pick_result
            END,
            points_earned = CASE
                WHEN (NEW.home_score + NEW.spread) = NEW.away_score THEN 10
                WHEN (selected_team = NEW.home_team AND NEW.home_covered)
                  OR (selected_team = NEW.away_team AND NEW.away_covered) THEN
                    CASE WHEN is_lock THEN 40 ELSE 20 END
                ELSE 0
            END
        WHERE game_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Step 4: Recreate the trigger
CREATE TRIGGER calculate_pick_results_trigger
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION calculate_pick_results();

-- Step 5: Update existing completed games to populate the new columns
UPDATE games 
SET home_covered = CASE 
    WHEN winner_against_spread IS NULL THEN NULL
    WHEN winner_against_spread = 'push' THEN TRUE
    WHEN winner_against_spread = home_team THEN TRUE
    ELSE FALSE
END,
away_covered = CASE 
    WHEN winner_against_spread IS NULL THEN NULL
    WHEN winner_against_spread = 'push' THEN TRUE
    WHEN winner_against_spread = away_team THEN TRUE
    ELSE FALSE
END
WHERE status = 'completed' AND winner_against_spread IS NOT NULL;

-- Step 6: Now we can safely update the Nebraska game status
UPDATE games 
SET status = 'completed'
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 7: Verify the update worked
SELECT 
    id,
    home_team,
    away_team,
    home_score,
    away_score,
    spread,
    status,
    winner_against_spread,
    home_covered,
    away_covered
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 8: Verify that picks were recalculated correctly for this game
SELECT 
    u.display_name,
    p.selected_team,
    p.is_lock,
    p.result,
    p.points_earned
FROM picks p
JOIN users u ON p.user_id = u.id
WHERE p.game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
ORDER BY u.display_name;