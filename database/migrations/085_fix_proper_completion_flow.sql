-- Migration 085: Fix proper game completion flow
-- 
-- CORRECT FLOW:
-- 1. Live scores update: points, period, clock (no scoring calculations)
-- 2. Game completes: status='completed' + calculate winner_against_spread + margin_bonus
-- 3. THEN: Update picks table based on completed game data
--
-- PROBLEM WITH CURRENT SYSTEM:
-- - Trigger runs on EVERY update (even live score updates)
-- - Should only calculate scoring when game actually completes
-- - Pick updates should happen AFTER game scoring is finalized

BEGIN;

-- Drop the conditional trigger from Migration 084
DROP TRIGGER IF EXISTS update_game_scoring_conditional_trigger ON public.games;

-- Create trigger that ONLY runs when status changes to 'completed'
CREATE OR REPLACE FUNCTION update_game_completion_scoring()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- ONLY run when status changes from not-completed to completed
    IF (OLD.status != 'completed' AND NEW.status = 'completed') THEN
        
        RAISE NOTICE 'Game completing: % @ % - calculating final scoring', NEW.away_team, NEW.home_team;
        
        -- Calculate final winner against spread
        IF NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN
            NEW.winner_against_spread := calculate_winner_against_spread(
                NEW.home_team, NEW.away_team, NEW.home_score, NEW.away_score, NEW.spread
            );
            
            -- Calculate final margin bonus
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
            
            RAISE NOTICE 'Final scoring: winner_against_spread=%, margin_bonus=%', 
                NEW.winner_against_spread, NEW.margin_bonus;
        ELSE
            RAISE NOTICE 'Cannot calculate scoring: missing scores (home=%, away=%)', 
                NEW.home_score, NEW.away_score;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create BEFORE UPDATE trigger that only fires on completion
CREATE TRIGGER update_game_completion_trigger
    BEFORE UPDATE ON public.games
    FOR EACH ROW
    WHEN (OLD.status != 'completed' AND NEW.status = 'completed')
    EXECUTE FUNCTION update_game_completion_scoring();

-- Create AFTER UPDATE trigger to update picks AFTER game completion is finalized
CREATE OR REPLACE FUNCTION update_picks_after_game_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only run when game just completed (status changed to completed)
    IF (OLD.status != 'completed' AND NEW.status = 'completed') THEN
        
        RAISE NOTICE 'Game completed, updating picks for game: % @ %', NEW.away_team, NEW.home_team;
        
        -- Update picks for this completed game
        UPDATE public.picks
        SET 
            result = CASE 
                WHEN selected_team = NEW.winner_against_spread THEN 'win'::pick_result
                WHEN NEW.winner_against_spread = 'push' THEN 'push'::pick_result
                ELSE 'loss'::pick_result
            END,
            points_earned = CASE 
                WHEN selected_team = NEW.winner_against_spread THEN 
                    NEW.base_points + NEW.margin_bonus + 
                    CASE WHEN is_lock THEN NEW.margin_bonus ELSE 0 END
                WHEN NEW.winner_against_spread = 'push' THEN 10
                ELSE 0
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE game_id = NEW.id 
        AND result IS NULL; -- Only update picks that haven't been calculated yet
        
        RAISE NOTICE 'Updated picks for completed game: %', NEW.id;
        
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create AFTER UPDATE trigger for picks updates
CREATE TRIGGER update_picks_after_completion_trigger
    AFTER UPDATE ON public.games
    FOR EACH ROW
    WHEN (OLD.status != 'completed' AND NEW.status = 'completed')
    EXECUTE FUNCTION update_picks_after_game_completion();

-- Add explanatory comment
COMMENT ON TABLE public.games IS 
    'Games table with proper completion flow: 1) Live updates (scores/clock), 2) Completion (status+scoring), 3) Pick updates';

-- Log the proper fix
DO $$
BEGIN
    RAISE NOTICE '🎯 Migration 085: PROPER COMPLETION FLOW IMPLEMENTED';
    RAISE NOTICE '✅ BEFORE UPDATE: Only calculates scoring when status changes to completed';
    RAISE NOTICE '✅ AFTER UPDATE: Updates picks table after game completion is finalized';
    RAISE NOTICE '✅ Live score updates (points/period/clock) no longer trigger calculations';
    RAISE NOTICE '✅ Completion is now a clean 3-step process';
    RAISE NOTICE '🚀 Games should complete smoothly and picks should update correctly!';
END;
$$;

COMMIT;