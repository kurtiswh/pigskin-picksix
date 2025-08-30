-- Investigate exactly what the trigger functions are doing
-- They're still calculating ATS themselves instead of using games.winner_against_spread

-- Step 1: Show the ACTUAL source code of the trigger functions
-- This will reveal if they have hardcoded spread calculations
SELECT 
    'ACTUAL trigger function source code:' as investigation,
    routine_name as function_name,
    routine_definition as source_code
FROM information_schema.routines 
WHERE routine_name IN ('recalculate_weekly_leaderboard', 'recalculate_season_leaderboard')
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Step 2: Look for any OTHER functions that might be doing pick calculations
SELECT 
    'All functions that might affect picks:' as search,
    routine_name,
    routine_type,
    CASE 
        WHEN routine_definition LIKE '%spread%' AND routine_definition NOT LIKE '%winner_against_spread%' THEN '❌ HARDCODED SPREAD CALC'
        WHEN routine_definition LIKE '%home_score%' OR routine_definition LIKE '%away_score%' THEN '❌ DOING OWN SCORING'
        WHEN routine_definition LIKE '%winner_against_spread%' THEN '✅ Uses games table'
        WHEN routine_definition LIKE '%calculate_pick_from_game%' THEN '✅ Uses helper function'
        ELSE '❓ Unknown'
    END as calc_type
FROM information_schema.routines 
WHERE (routine_definition LIKE '%picks%' 
   OR routine_definition LIKE '%spread%'
   OR routine_definition LIKE '%score%'
   OR routine_definition LIKE '%result%')
  AND routine_type = 'FUNCTION'
  AND routine_schema = 'public'
ORDER BY calc_type DESC, routine_name;

-- Step 3: Check what's in the calculate_pick_from_game function we created
SELECT 
    'calculate_pick_from_game function check:' as helper_func,
    routine_definition as logic
FROM information_schema.routines 
WHERE routine_name = 'calculate_pick_from_game'
  AND routine_type = 'FUNCTION';

-- Step 4: Show current Nebraska game state in games table
SELECT 
    'Current games table state for Nebraska:' as game_state,
    home_team,
    away_team,
    home_score,
    away_score,
    spread,
    winner_against_spread,
    base_points,
    margin_bonus,
    'Cincinnati should be winner_against_spread' as expected
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 5: Test the calculate_pick_from_game function directly
-- This will show if our helper function works correctly
SELECT 
    'Testing calculate_pick_from_game function:' as test,
    selected_team,
    (calc.*) as calculated_result
FROM (
    SELECT 'CINCINNATI' as selected_team
    UNION ALL
    SELECT 'NEBRASKA' as selected_team
) teams
CROSS JOIN LATERAL (
    SELECT * FROM public.calculate_pick_from_game(
        teams.selected_team,
        false, -- not a lock pick
        (SELECT winner_against_spread FROM games WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef'),
        (SELECT base_points FROM games WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef'),
        (SELECT margin_bonus FROM games WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef')
    )
) calc;

-- Step 6: Check if there are any OTHER triggers we missed
SELECT 
    'ALL triggers on picks table:' as all_triggers,
    trigger_name,
    action_timing,
    event_manipulation,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'picks'
ORDER BY trigger_name;

-- Step 7: Check if there are any stored procedures or other functions
-- that might be called during pick updates
SELECT 
    'Functions that reference picks table:' as picks_functions,
    routine_name,
    routine_type,
    'This might be overriding our changes' as note
FROM information_schema.routines 
WHERE routine_definition LIKE '%UPDATE%picks%'
   OR routine_definition LIKE '%INSERT%picks%'
ORDER BY routine_name;