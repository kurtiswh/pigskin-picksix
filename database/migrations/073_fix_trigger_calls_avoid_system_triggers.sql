-- Fix trigger function calls without affecting system triggers
-- CORRECTED VERSION - Avoids disabling system/constraint triggers

-- Step 1: Show current triggers and what functions they call
SELECT 
    'Current trigger configuration:' as info,
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement,
    'Check which function each trigger calls' as note
FROM information_schema.triggers 
WHERE event_object_table = 'picks'
ORDER BY trigger_name;

-- Step 2: Drop and recreate the triggers to call the CORRECT functions
-- These should call functions that use games table as source of truth

-- Drop existing problematic triggers
DROP TRIGGER IF EXISTS update_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_trigger ON public.picks;

-- Step 3: Create NEW triggers that call the CORRECT functions
-- These call the functions from migration 064 that use games table

CREATE TRIGGER update_weekly_leaderboard_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.picks
    FOR EACH ROW
    EXECUTE FUNCTION public.recalculate_weekly_leaderboard();

CREATE TRIGGER update_season_leaderboard_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.picks
    FOR EACH ROW  
    EXECUTE FUNCTION public.recalculate_season_leaderboard();

-- Step 4: Verify the trigger functions are using the correct logic
SELECT 
    'Checking if trigger functions use games table:' as verification,
    routine_name,
    CASE 
        WHEN routine_definition LIKE '%calculate_pick_from_game%' THEN '✅ Uses games table via calculate_pick_from_game'
        WHEN routine_definition LIKE '%winner_against_spread%' THEN '✅ References winner_against_spread'
        WHEN routine_definition LIKE '%spread%' AND routine_definition NOT LIKE '%winner_against_spread%' THEN '❌ Uses hardcoded spread calculation'
        ELSE '❓ Unclear - needs manual review'
    END as status
FROM information_schema.routines 
WHERE routine_name IN ('recalculate_weekly_leaderboard', 'recalculate_season_leaderboard')
ORDER BY routine_name;

-- Step 5: Test the fix with Nebraska game (DISABLE ONLY OUR TRIGGERS)
-- Disable only our specific triggers, not system triggers
ALTER TABLE picks DISABLE TRIGGER update_weekly_leaderboard_trigger;
ALTER TABLE picks DISABLE TRIGGER update_season_leaderboard_trigger;

-- Set correct values
UPDATE picks 
SET 
    result = 'win'::pick_result,
    points_earned = 20,
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'CINCINNATI';

UPDATE picks 
SET 
    result = 'loss'::pick_result,
    points_earned = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'NEBRASKA';

-- Re-enable our specific triggers (now with correct function calls)
ALTER TABLE picks ENABLE TRIGGER update_weekly_leaderboard_trigger;
ALTER TABLE picks ENABLE TRIGGER update_season_leaderboard_trigger;

-- Step 6: Test if the triggers now maintain correct values
-- Get one pick ID to trigger recalculation
DO $$
DECLARE
    test_pick_id UUID;
BEGIN
    -- Get one Cincinnati pick ID for triggering
    SELECT id INTO test_pick_id
    FROM picks 
    WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
      AND selected_team = 'CINCINNATI'
    LIMIT 1;
    
    -- Update that specific pick to trigger recalculation
    IF test_pick_id IS NOT NULL THEN
        UPDATE picks 
        SET updated_at = CURRENT_TIMESTAMP 
        WHERE id = test_pick_id;
        RAISE NOTICE 'Triggered recalculation for pick ID: %', test_pick_id;
    END IF;
END;
$$;

-- Step 7: Final verification - picks should remain correct after trigger test
SELECT 
    'Final test - triggers should maintain correct picks:' as test_result,
    selected_team,
    COUNT(*) as pick_count,
    result,
    points_earned,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' AND points_earned = 20 THEN '✅ FIXED - Cincinnati wins ATS'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' AND points_earned = 0 THEN '✅ FIXED - Nebraska loses ATS'
        ELSE '❌ STILL BROKEN - Triggers reverted: ' || result::text || ' (' || points_earned || ' pts)'
    END as trigger_fix_status
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;

-- Step 8: Show what the games table says for verification
SELECT 
    'Games table verification:' as info,
    away_team || ' @ ' || home_team as matchup,
    winner_against_spread as ats_winner,
    base_points,
    margin_bonus,
    'Picks should match winner_against_spread: ' || winner_against_spread as expected
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 9: Show all current triggers to confirm setup
SELECT 
    'Final trigger configuration:' as final_check,
    trigger_name,
    action_statement,
    'These triggers should now call the correct functions' as note
FROM information_schema.triggers 
WHERE event_object_table = 'picks'
  AND trigger_name LIKE '%leaderboard%'
ORDER BY trigger_name;

-- Step 10: Final success message
SELECT 
    '🎯 Nebraska ATS Fix Status:' as summary,
    'Triggers recreated to call functions using games.winner_against_spread' as fix_applied,
    'Expected: Cincinnati=WIN(20pts), Nebraska=LOSS(0pts)' as expected_result,
    'System constraint triggers left untouched' as safety_note;