-- Migration 084: Disable update_game_winner_scoring_trigger that's blocking game completion
-- 
-- ROOT CAUSE: The update_game_winner_scoring_trigger is the LAST remaining trigger on games table
-- ISSUE: This BEFORE UPDATE trigger runs on EVERY update, including status changes
-- PROBLEM: When trying to update status='completed', the trigger recalculates scoring which may interfere
-- SOLUTION: Disable this trigger and create a smarter conditional version
--
-- This is the FINAL piece of the puzzle after disabling:
--   - recalculate_pick_points_trigger (Migration 080)
--   - update_pick_stats_on_game_completion_safe_trigger (Migration 082)  
--   - update_covered_status_trigger (Migration 082)
--   - Leaderboard triggers on picks table (Migration 083)

BEGIN;

-- Drop the last remaining trigger on games table that's blocking status updates
DROP TRIGGER IF EXISTS update_game_winner_scoring_trigger ON public.games;

-- Create a SMARTER trigger that only runs when scores actually change
-- This prevents interference with status-only updates
CREATE OR REPLACE FUNCTION update_game_winner_against_spread_conditional()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- ONLY run calculations if scores actually changed
    -- Skip for status-only updates to prevent blocking
    IF (OLD.home_score IS DISTINCT FROM NEW.home_score) OR 
       (OLD.away_score IS DISTINCT FROM NEW.away_score) OR
       (OLD.spread IS DISTINCT FROM NEW.spread) THEN
        
        -- Only calculate if we have valid scores
        IF NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN
            -- Update winner against spread
            NEW.winner_against_spread := calculate_winner_against_spread(
                NEW.home_team, NEW.away_team, NEW.home_score, NEW.away_score, NEW.spread
            );
            
            -- Update margin bonus
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
        END IF;
    END IF;
    
    -- ALWAYS return NEW to allow the update to proceed
    RETURN NEW;
END;
$$;

-- Create the conditional trigger with a different name to ensure clean state
CREATE TRIGGER update_game_scoring_conditional_trigger
    BEFORE UPDATE ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION update_game_winner_against_spread_conditional();

-- Create manual function to recalculate scoring for all games if needed
CREATE OR REPLACE FUNCTION public.manual_recalculate_game_scoring()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Manually recalculate scoring for all completed games
    UPDATE public.games 
    SET 
        winner_against_spread = calculate_winner_against_spread(
            home_team, away_team, home_score, away_score, spread
        ),
        margin_bonus = CASE 
            WHEN calculate_winner_against_spread(home_team, away_team, home_score, away_score, spread) = 'push' 
                OR calculate_winner_against_spread(home_team, away_team, home_score, away_score, spread) IS NULL 
            THEN 0
            WHEN calculate_winner_against_spread(home_team, away_team, home_score, away_score, spread) = home_team 
            THEN
                CASE 
                    WHEN (home_score + spread - away_score) >= 29 THEN 5
                    WHEN (home_score + spread - away_score) >= 20 THEN 3  
                    WHEN (home_score + spread - away_score) >= 11 THEN 1
                    ELSE 0
                END
            WHEN calculate_winner_against_spread(home_team, away_team, home_score, away_score, spread) = away_team 
            THEN
                CASE 
                    WHEN (away_score - home_score - spread) >= 29 THEN 5
                    WHEN (away_score - home_score - spread) >= 20 THEN 3
                    WHEN (away_score - home_score - spread) >= 11 THEN 1  
                    ELSE 0
                END
            ELSE 0
        END
    WHERE status = 'completed' 
    AND home_score IS NOT NULL 
    AND away_score IS NOT NULL;
    
    RAISE NOTICE 'Recalculated scoring for all completed games';
END;
$$;

-- Add explanatory comment
COMMENT ON TABLE public.games IS 
    'Games table with conditional scoring trigger. Status updates no longer blocked by scoring calculations.';

-- Log the critical fix
DO $$
BEGIN
    RAISE NOTICE '🎯 Migration 084: FINAL TRIGGER FIX - Disabled blocking trigger';
    RAISE NOTICE '❌ update_game_winner_scoring_trigger -> DISABLED (was blocking status updates)';
    RAISE NOTICE '✅ update_game_scoring_conditional_trigger -> CREATED (only runs on score changes)';
    RAISE NOTICE '✅ Status-only updates (like completed) will no longer be blocked';
    RAISE NOTICE '✅ Scoring calculations still work when scores actually change';
    RAISE NOTICE '✅ Use manual_recalculate_game_scoring() if needed';
    RAISE NOTICE '🚀 Games should finally update to completed status!';
END;
$$;

COMMIT;