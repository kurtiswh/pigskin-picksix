-- Diagnostic Query: Check Pick Processing Status
-- Run this to understand why picks aren't being processed

-- Step 1: Check active week
SELECT 'Active Week' as check_type, week, season, picks_open, deadline
FROM week_settings
WHERE picks_open = true
ORDER BY week DESC
LIMIT 1;

-- Step 2: Check completed games status
SELECT
    'Completed Games' as check_type,
    COUNT(*) as total_completed,
    COUNT(winner_against_spread) as games_with_winner,
    COUNT(*) FILTER (WHERE winner_against_spread IS NULL) as games_without_winner,
    COUNT(*) FILTER (WHERE home_score IS NULL OR away_score IS NULL) as games_without_scores
FROM games
WHERE season = 2025
  AND week = (SELECT week FROM week_settings WHERE picks_open = true ORDER BY week DESC LIMIT 1)
  AND status = 'completed';

-- Step 3: Check pick processing status for completed games
SELECT
    g.home_team || ' vs ' || g.away_team as game,
    g.status,
    g.home_score,
    g.away_score,
    g.winner_against_spread,
    g.margin_bonus,
    COUNT(p.id) FILTER (WHERE p.result IS NULL) as unprocessed_picks,
    COUNT(p.id) FILTER (WHERE p.result IS NOT NULL) as processed_picks,
    COUNT(ap.id) FILTER (WHERE ap.result IS NULL) as unprocessed_anon_picks,
    COUNT(ap.id) FILTER (WHERE ap.result IS NOT NULL) as processed_anon_picks
FROM games g
LEFT JOIN picks p ON g.id = p.game_id
LEFT JOIN anonymous_picks ap ON g.id = ap.game_id
WHERE g.season = 2025
  AND g.week = (SELECT week FROM week_settings WHERE picks_open = true ORDER BY week DESC LIMIT 1)
  AND g.status = 'completed'
GROUP BY g.id, g.home_team, g.away_team, g.status, g.home_score, g.away_score, g.winner_against_spread, g.margin_bonus
ORDER BY g.kickoff_time;

-- Step 4: Check if scoring function exists
SELECT
    'Function Check' as check_type,
    proname as function_name,
    pg_get_functiondef(oid) LIKE '%calculate_and_update_completed_game%' as is_scoring_function
FROM pg_proc
WHERE proname IN ('calculate_and_update_completed_game', 'process_picks_for_completed_game')
ORDER BY proname;

-- Step 5: Sample unprocessed picks
SELECT
    'Sample Unprocessed Picks' as check_type,
    u.display_name,
    g.home_team || ' vs ' || g.away_team as game,
    p.selected_team,
    p.is_lock,
    p.result,
    p.points_earned,
    p.submitted_at
FROM picks p
JOIN games g ON p.game_id = g.id
JOIN users u ON p.user_id = u.id
WHERE g.season = 2025
  AND g.week = (SELECT week FROM week_settings WHERE picks_open = true ORDER BY week DESC LIMIT 1)
  AND g.status = 'completed'
  AND p.result IS NULL
LIMIT 10;

-- Step 6: Check GitHub Actions / Edge Function logs hint
SELECT
    'Troubleshooting Hints' as info_type,
    'If games are completed but picks unprocessed, check:' as hint_1,
    '1. GitHub Actions workflow logs for errors' as hint_2,
    '2. Supabase Edge Function logs' as hint_3,
    '3. Run: SELECT * FROM calculate_and_update_completed_game(game_id);' as hint_4;
