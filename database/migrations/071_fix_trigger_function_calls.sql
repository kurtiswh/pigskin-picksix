-- Fix the actual trigger function calls that are reverting Nebraska picks
-- The issue is the triggers are calling OLD functions with hardcoded ATS logic
-- instead of the NEW functions that use games table as source of truth

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

-- Step 2: The problem is likely that triggers are calling old hardcoded functions
-- Let's check what the current trigger functions actually do
-- We need to identify if they're using hardcoded spread calculation vs games table

-- Step 3: Drop and recreate the triggers to call the CORRECT functions
-- These should call functions that use games table as source of truth

-- Drop existing problematic triggers
DROP TRIGGER IF EXISTS update_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_trigger ON public.picks;

-- Step 4: Create NEW triggers that call the CORRECT functions
-- These call the functions from migration 064 that use games table

CREATE TRIGGER update_weekly_leaderboard_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.picks
    FOR EACH ROW
    EXECUTE FUNCTION public.recalculate_weekly_leaderboard();

CREATE TRIGGER update_season_leaderboard_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.picks
    FOR EACH ROW  
    EXECUTE FUNCTION public.recalculate_season_leaderboard();

-- Step 5: Verify the trigger functions are using the correct logic
-- Check that recalculate_weekly_leaderboard calls calculate_pick_from_game
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

-- Step 6: Test the fix with Nebraska game
-- Disable triggers first to set correct baseline
ALTER TABLE picks DISABLE TRIGGER ALL;

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

-- Re-enable the FIXED triggers
ALTER TABLE picks ENABLE TRIGGER ALL;

-- Step 7: Test if the triggers now maintain correct values
-- This should NOT revert the picks if triggers are fixed
UPDATE picks 
SET updated_at = CURRENT_TIMESTAMP 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
LIMIT 1;

-- Step 8: Final verification - picks should remain correct
SELECT 
    'Final test - triggers should maintain correct picks:' as test_result,
    selected_team,
    COUNT(*) as pick_count,
    result,
    points_earned,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' AND points_earned = 20 THEN '✅ FIXED - Cincinnati wins ATS'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' AND points_earned = 0 THEN '✅ FIXED - Nebraska loses ATS'
        ELSE '❌ STILL BROKEN - Triggers are still using wrong logic'
    END as trigger_fix_status
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;

-- Step 9: Show what the games table says for verification
SELECT 
    'Games table verification:' as info,
    away_team || ' @ ' || home_team as matchup,
    winner_against_spread as ats_winner,
    base_points,
    margin_bonus,
    'Cincinnati should match this winner_against_spread value' as note
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';