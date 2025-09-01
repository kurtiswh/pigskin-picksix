-- Migration 090: ULTRA-MINIMAL completion trigger - no complex calculations
-- 
-- DISCOVERY: Even the minimal trigger with calculate_winner_against_spread() times out
-- PROBLEM: The calculate_winner_against_spread() function itself is causing the timeout
-- SOLUTION: Create ultra-minimal trigger with ONLY basic field updates, no calculations

BEGIN;

-- First, drop the minimal trigger that failed
DROP TRIGGER IF EXISTS update_game_scoring_minimal_trigger ON public.games;

-- Create ultra-minimal function that just sets basic completion fields
CREATE OR REPLACE FUNCTION update_game_completion_ultra_minimal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- ONLY run when status changes to completed
    IF (OLD.status != 'completed' AND NEW.status = 'completed') THEN
        
        RAISE NOTICE 'Ultra-minimal completion trigger firing for: % @ %', NEW.away_team, NEW.home_team;
        
        -- Set ONLY the most basic completion fields - NO calculations
        NEW.api_completed := true;
        NEW.updated_at := CURRENT_TIMESTAMP;
        
        -- Do NOT calculate winner_against_spread or margin_bonus yet
        -- This isolates whether the timeout is in the calculation functions
        
        RAISE NOTICE 'Ultra-minimal completion done - no calculations performed';
        
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create ULTRA-MINIMAL BEFORE UPDATE trigger
CREATE TRIGGER update_game_completion_ultra_minimal_trigger
    BEFORE UPDATE ON public.games
    FOR EACH ROW
    WHEN (OLD.status != 'completed' AND NEW.status = 'completed')
    EXECUTE FUNCTION update_game_completion_ultra_minimal();

-- Add explanatory comment
COMMENT ON TABLE public.games IS 
    'Testing ULTRA-MINIMAL trigger - only sets api_completed=true, no winner calculations';

-- Log the ultra-minimal test
DO $$
BEGIN
    RAISE NOTICE '🧪 Migration 090: ULTRA-MINIMAL TRIGGER TEST';
    RAISE NOTICE '✅ update_game_completion_ultra_minimal_trigger -> ADDED';
    RAISE NOTICE '❌ calculate_winner_against_spread() -> BYPASSED';
    RAISE NOTICE '❌ margin_bonus calculations -> BYPASSED';
    RAISE NOTICE '🔍 TEST: If this still times out, issue is NOT in calculations';
    RAISE NOTICE '🔍 If this works, we know calculate_winner_against_spread() is the problem';
    RAISE NOTICE '⚡ This trigger does NOTHING except set api_completed=true';
END;
$$;

COMMIT;