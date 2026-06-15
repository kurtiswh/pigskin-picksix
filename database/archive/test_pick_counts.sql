-- Test pick count function
SELECT 'Testing pick count function for Week 1 Season 2024' as test_message;

-- Check if function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_name = 'update_week_game_pick_counts' 
AND routine_type = 'FUNCTION';

-- Test the function
SELECT * FROM update_week_game_pick_counts(1, 2024);

-- Check current pick counts for Week 1
SELECT 
    id,
    away_team || ' @ ' || home_team as matchup,
    home_team_picks,
    home_team_locks, 
    away_team_picks,
    away_team_locks,
    total_picks
FROM games 
WHERE week = 1 AND season = 2024
ORDER BY kickoff_time
LIMIT 5;