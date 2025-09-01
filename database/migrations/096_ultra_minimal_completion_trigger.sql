-- Migration 096: Ultra-minimal completion trigger
-- 
-- PURPOSE: Create the most minimal possible completion trigger to eliminate slowness
-- THEORY: Current completion trigger may still be doing too much work

-- First, disable ALL existing triggers on games table
DO $$
DECLARE
    trigger_rec RECORD;
BEGIN
    RAISE NOTICE '🧹 Migration 096: ULTRA-MINIMAL COMPLETION TRIGGER';
    RAISE NOTICE '================================================';
    RAISE NOTICE '1️⃣ Disabling ALL existing triggers on games table...';
    
    FOR trigger_rec IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'games' 
        AND trigger_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON games', trigger_rec.trigger_name);
        RAISE NOTICE '   ❌ Disabled trigger: %', trigger_rec.trigger_name;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '2️⃣ Creating ultra-minimal completion function...';
END;
$$;

-- Create ultra-minimal completion function (ONLY calculates winner ATS)
CREATE OR REPLACE FUNCTION handle_ultra_minimal_completion()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    home_score_val integer;
    away_score_val integer;
    spread_val numeric;
    home_covers boolean;
    margin integer;
    margin_bonus_val integer;
BEGIN
    -- Only run if status changed to completed
    IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
        
        -- Get required values
        home_score_val := NEW.home_score;
        away_score_val := NEW.away_score;
        spread_val := NEW.spread;
        
        -- Calculate winner against spread (minimal calculation)
        IF home_score_val IS NOT NULL AND away_score_val IS NOT NULL AND spread_val IS NOT NULL THEN
            home_covers := (home_score_val + spread_val) > away_score_val;
            
            IF home_covers THEN
                NEW.winner_against_spread := NEW.home_team;
            ELSE
                NEW.winner_against_spread := NEW.away_team;
            END IF;
            
            -- Calculate margin bonus (simplified)
            margin := abs(home_score_val - away_score_val);
            
            -- Simple margin bonus calculation
            IF margin >= 21 THEN
                margin_bonus_val := 5;
            ELSIF margin >= 14 THEN
                margin_bonus_val := 3;
            ELSIF margin >= 7 THEN
                margin_bonus_val := 1;
            ELSE
                margin_bonus_val := 0;
            END IF;
            
            NEW.margin_bonus := margin_bonus_val;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create ultra-minimal trigger (fires ONLY on completion)
CREATE TRIGGER handle_ultra_minimal_completion_trigger
    BEFORE UPDATE ON public.games
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed')
    EXECUTE FUNCTION handle_ultra_minimal_completion();

-- Add diagnostic notice
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Ultra-minimal completion trigger created!';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 WHAT THIS DOES:';
    RAISE NOTICE '- Only fires when status changes to "completed"';
    RAISE NOTICE '- Only calculates winner_against_spread and margin_bonus';
    RAISE NOTICE '- No pick processing, no leaderboard updates, no complex queries';
    RAISE NOTICE '- Should complete in milliseconds, not seconds';
    RAISE NOTICE '';
    RAISE NOTICE '📋 TEST NEXT:';
    RAISE NOTICE '1. Set a completed game back to in_progress';
    RAISE NOTICE '2. Update status to completed and time it';
    RAISE NOTICE '3. Should be much faster now';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 IF STILL SLOW:';
    RAISE NOTICE '- Issue is not in triggers';
    RAISE NOTICE '- May be database infrastructure or connection limits';
END;
$$;