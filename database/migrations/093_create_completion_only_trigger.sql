-- Migration 093: Create COMPLETION-ONLY trigger that prevents premature scoring
-- 
-- SOLUTION: Trigger that ONLY fires when status changes from non-completed to completed
-- DESIGN: No calculations during live updates, only when game actually finishes
-- GOAL: Eliminate competing processes that cause timeout and premature scoring

BEGIN;

-- Create completion-only scoring function
CREATE OR REPLACE FUNCTION handle_game_completion_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- CRITICAL: ONLY run when status changes TO completed (not during live updates)
    IF (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed') THEN
        
        RAISE NOTICE '🎯 Game completing: % @ % - calculating final scores only', NEW.away_team, NEW.home_team;
        
        -- Only calculate if we have required data
        IF NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL AND NEW.spread IS NOT NULL THEN
            
            -- Calculate winner against spread using simple inline logic (no function calls)
            DECLARE
                home_margin DECIMAL;
                winner_team TEXT;
            BEGIN
                home_margin := NEW.home_score - NEW.away_score;
                
                -- Simple winner calculation
                IF ABS(home_margin - NEW.spread) < 0.5 THEN
                    winner_team := 'push';
                ELSIF (NEW.spread < 0 AND home_margin > ABS(NEW.spread)) OR 
                      (NEW.spread > 0 AND home_margin > NEW.spread) THEN
                    winner_team := NEW.home_team;
                ELSE
                    winner_team := NEW.away_team;
                END IF;
                
                NEW.winner_against_spread := winner_team;
                
                -- Calculate margin bonus based on winner (simple inline calculation)
                IF winner_team IS NULL OR winner_team = 'push' THEN
                    NEW.margin_bonus := 0;
                ELSIF winner_team = NEW.home_team THEN
                    NEW.margin_bonus := CASE 
                        WHEN (home_margin - NEW.spread) >= 29 THEN 5
                        WHEN (home_margin - NEW.spread) >= 20 THEN 3
                        WHEN (home_margin - NEW.spread) >= 11 THEN 1
                        ELSE 0
                    END;
                ELSIF winner_team = NEW.away_team THEN
                    NEW.margin_bonus := CASE 
                        WHEN ABS(home_margin - NEW.spread) >= 29 THEN 5
                        WHEN ABS(home_margin - NEW.spread) >= 20 THEN 3
                        WHEN ABS(home_margin - NEW.spread) >= 11 THEN 1
                        ELSE 0
                    END;
                ELSE
                    NEW.margin_bonus := 0;
                END IF;
            END;
            
            RAISE NOTICE '✅ Calculated: winner=%, margin_bonus=%', NEW.winner_against_spread, NEW.margin_bonus;
            
        ELSE
            -- Missing data - set safe defaults
            RAISE WARNING 'Cannot calculate scores - missing data for game %', NEW.id;
            NEW.winner_against_spread := NULL;
            NEW.margin_bonus := 0;
        END IF;
        
        -- Always set completion flag
        NEW.api_completed := true;
        
    END IF;
    
    -- Always allow the update to proceed
    RETURN NEW;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Never block updates due to calculation errors
        RAISE WARNING 'Error in completion trigger for game %: %', NEW.id, SQLERRM;
        NEW.api_completed := true; -- Still mark as completed
        RETURN NEW;
END;
$$;

-- Create COMPLETION-ONLY trigger
CREATE TRIGGER handle_game_completion_only_trigger
    BEFORE UPDATE ON public.games
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
    EXECUTE FUNCTION handle_game_completion_only();

-- Add helpful comment
COMMENT ON TABLE public.games IS 
    'COMPLETION-ONLY trigger: Scores calculated ONLY when status changes to completed, never during live updates';

-- Log the completion-only trigger creation
DO $$
BEGIN
    RAISE NOTICE '🎯 Migration 093: COMPLETION-ONLY TRIGGER CREATED';
    RAISE NOTICE '✅ handle_game_completion_only_trigger -> CREATED';
    RAISE NOTICE '🔒 ONLY fires when status changes TO completed';
    RAISE NOTICE '🚫 NEVER fires during live updates (scores, time, period changes)';
    RAISE NOTICE '💡 Uses simple inline calculations - no function calls';
    RAISE NOTICE '🛡️ Has exception handling to never block updates';
    RAISE NOTICE '🎉 Should eliminate timeout issues and premature scoring';
END;
$$;

COMMIT;