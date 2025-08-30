-- Identify which trigger is reverting the Nebraska picks back to incorrect values
-- This will show us exactly which trigger function contains the hardcoded ATS logic

-- Step 1: Show all current triggers on picks table
SELECT 
    'Current triggers on picks table:' as info,
    trigger_name,
    event_manipulation as event_type,
    action_timing as timing,
    action_statement as function_call
FROM information_schema.triggers 
WHERE event_object_table = 'picks'
ORDER BY trigger_name;

-- Step 2: Check the current picks state (should show correct after manual fix)
SELECT 
    'Current picks state (before trigger re-enable test):' as info,
    selected_team,
    COUNT(*) as pick_count,
    result,
    points_earned,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' AND points_earned = 20 THEN '✅ Correct'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' AND points_earned = 0 THEN '✅ Correct'
        ELSE '❌ Wrong: ' || result::text || ' (' || points_earned || ' pts)'
    END as validation
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;

-- Step 3: Test individual triggers one by one
-- First disable all triggers
ALTER TABLE picks DISABLE TRIGGER ALL;

-- Re-enable ONLY the season leaderboard trigger
ALTER TABLE picks ENABLE TRIGGER update_season_leaderboard_trigger;

-- Test with a small update to see if this trigger causes reversion
UPDATE picks 
SET updated_at = CURRENT_TIMESTAMP 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef' 
  AND selected_team = 'CINCINNATI' 
LIMIT 1;

-- Check if season trigger reverted the picks
SELECT 
    'After enabling ONLY season trigger:' as test,
    selected_team,
    result,
    points_earned,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' AND points_earned = 20 THEN '✅ Season trigger OK'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' AND points_earned = 0 THEN '✅ Season trigger OK'
        ELSE '❌ SEASON TRIGGER REVERTED: ' || result::text || ' (' || points_earned || ' pts)'
    END as season_trigger_test
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;

-- Step 4: Disable season trigger, enable weekly trigger
ALTER TABLE picks DISABLE TRIGGER update_season_leaderboard_trigger;
ALTER TABLE picks ENABLE TRIGGER update_weekly_leaderboard_trigger;

-- Test weekly trigger
UPDATE picks 
SET updated_at = CURRENT_TIMESTAMP 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef' 
  AND selected_team = 'NEBRASKA' 
LIMIT 1;

-- Check if weekly trigger reverted the picks
SELECT 
    'After enabling ONLY weekly trigger:' as test,
    selected_team,
    result,
    points_earned,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' AND points_earned = 20 THEN '✅ Weekly trigger OK'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' AND points_earned = 0 THEN '✅ Weekly trigger OK'
        ELSE '❌ WEEKLY TRIGGER REVERTED: ' || result::text || ' (' || points_earned || ' pts)'
    END as weekly_trigger_test
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;

-- Step 5: Show the actual function code to identify the problem
-- This will show us the exact logic being used
SELECT 
    'Function definition for season leaderboard trigger:' as info,
    routine_name,
    routine_definition
FROM information_schema.routines 
WHERE routine_name LIKE '%season_leaderboard%' 
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

SELECT 
    'Function definition for weekly leaderboard trigger:' as info,
    routine_name,
    routine_definition  
FROM information_schema.routines 
WHERE routine_name LIKE '%weekly_leaderboard%' 
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Step 6: Check if there are any other pick-related triggers we missed
SELECT 
    'All functions that might affect picks:' as info,
    routine_name,
    routine_type,
    'Check if this function has hardcoded ATS logic' as note
FROM information_schema.routines 
WHERE routine_definition LIKE '%picks%' 
   OR routine_definition LIKE '%spread%'
   OR routine_definition LIKE '%winner_against_spread%'
ORDER BY routine_name;

-- Step 7: Reset to clean state for next fix
ALTER TABLE picks DISABLE TRIGGER ALL;

-- Re-apply the correct picks values
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

-- Final verification before we fix the problematic trigger
SELECT 
    'Ready for trigger fix - picks are correct:' as status,
    selected_team,
    result,
    points_earned,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' AND points_earned = 20 THEN '✅ Cincinnati correct'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' AND points_earned = 0 THEN '✅ Nebraska correct'
        ELSE '❌ Still wrong'
    END as verification
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;