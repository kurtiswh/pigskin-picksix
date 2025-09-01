-- Migration 089: Add back MINIMAL completion trigger to test what causes timeout
-- 
-- SUCCESS: Status update works with NO triggers (confirmed trigger-related issue)
-- PLAN: Add back ONE simple trigger at a time to identify the problematic one
-- GOAL: Find the minimal working trigger that doesn't cause timeout

BEGIN;

-- Step 1: Add back ONLY the game scoring trigger (BEFORE UPDATE)
-- This is the most minimal trigger - just calculates winner_against_spread
CREATE OR REPLACE FUNCTION update_game_scoring_minimal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- ONLY run when status changes to completed
    IF (OLD.status != 'completed' AND NEW.status = 'completed') THEN
        
        -- Only calculate if we have the basic data
        IF NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL AND NEW.spread IS NOT NULL THEN
            
            -- Calculate winner against spread using our function
            NEW.winner_against_spread := calculate_winner_against_spread(
                NEW.home_team, NEW.away_team, NEW.home_score, NEW.away_score, NEW.spread
            );
            
            -- Calculate margin bonus (simple version)
            NEW.margin_bonus := CASE 
                WHEN NEW.winner_against_spread = 'push' OR NEW.winner_against_spread IS NULL THEN 0
                WHEN NEW.winner_against_spread = NEW.home_team THEN
                    CASE 
                        WHEN (NEW.home_score + NEW.spread - NEW.away_score) >= 29 THEN 5
                        WHEN (NEW.home_score + NEW.spread - NEW.away_score) >= 20 THEN 3  
                        WHEN (NEW.home_score + NEW.spread - NEW.away_score) >= 11 THEN 1
                        ELSE 0
                    END
                WHEN NEW.winner_against_spread = NEW.away_team THEN
                    CASE 
                        WHEN (NEW.away_score - NEW.home_score - NEW.spread) >= 29 THEN 5
                        WHEN (NEW.away_score - NEW.home_score - NEW.spread) >= 20 THEN 3
                        WHEN (NEW.away_score - NEW.home_score - NEW.spread) >= 11 THEN 1  
                        ELSE 0
                    END
                ELSE 0
            END;
            
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create ONLY the minimal BEFORE UPDATE trigger
CREATE TRIGGER update_game_scoring_minimal_trigger
    BEFORE UPDATE ON public.games
    FOR EACH ROW
    WHEN (OLD.status != 'completed' AND NEW.status = 'completed')
    EXECUTE FUNCTION update_game_scoring_minimal();

-- DO NOT add the picks update trigger yet - test this one first

-- Add explanatory comment
COMMENT ON TABLE public.games IS 
    'Testing with MINIMAL completion trigger - only calculates game scoring, no pick updates yet.';

-- Log the minimal restoration
DO $$
BEGIN
    RAISE NOTICE '🧪 Migration 089: MINIMAL TRIGGER TEST';
    RAISE NOTICE '✅ update_game_scoring_minimal_trigger -> ADDED (BEFORE UPDATE only)';
    RAISE NOTICE '❌ pick update trigger -> NOT ADDED YET';
    RAISE NOTICE '🔍 TEST: Try completing a game - if this times out, the issue is in game scoring';
    RAISE NOTICE '🔍 If this works, we can add the pick update trigger next';
    RAISE NOTICE '⚡ This trigger only runs on status change to completed';
END;
$$;

COMMIT;