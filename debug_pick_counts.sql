-- Debug pick counts for Week 1 Season 2025
SELECT 'Week 1 2025 Games Pick Counts' as debug_section;

-- Check what the games table shows after the update
SELECT 
    away_team || ' @ ' || home_team as matchup,
    home_team_picks,
    home_team_locks,
    away_team_picks, 
    away_team_locks,
    total_picks,
    updated_at
FROM games 
WHERE week = 1 AND season = 2025
ORDER BY kickoff_time;

-- Check the actual pick counts from both tables combined
SELECT 'Actual Pick Counts from Both Tables' as debug_section;

SELECT 
    g.away_team || ' @ ' || g.home_team as matchup,
    -- Count from picks table
    (SELECT COUNT(*) FROM picks p WHERE p.game_id = g.id AND p.selected_team = g.home_team AND p.is_lock = false) as home_picks_table,
    (SELECT COUNT(*) FROM picks p WHERE p.game_id = g.id AND p.selected_team = g.home_team AND p.is_lock = true) as home_locks_table,
    (SELECT COUNT(*) FROM picks p WHERE p.game_id = g.id AND p.selected_team = g.away_team AND p.is_lock = false) as away_picks_table,
    (SELECT COUNT(*) FROM picks p WHERE p.game_id = g.id AND p.selected_team = g.away_team AND p.is_lock = true) as away_locks_table,
    -- Count from anonymous_picks table
    (SELECT COUNT(*) FROM anonymous_picks ap WHERE ap.game_id = g.id AND ap.selected_team = g.home_team AND ap.is_lock = false) as home_picks_anon,
    (SELECT COUNT(*) FROM anonymous_picks ap WHERE ap.game_id = g.id AND ap.selected_team = g.home_team AND ap.is_lock = true) as home_locks_anon,
    (SELECT COUNT(*) FROM anonymous_picks ap WHERE ap.game_id = g.id AND ap.selected_team = g.away_team AND ap.is_lock = false) as away_picks_anon,
    (SELECT COUNT(*) FROM anonymous_picks ap WHERE ap.game_id = g.id AND ap.selected_team = g.away_team AND ap.is_lock = true) as away_locks_anon,
    -- Combined totals
    (
        (SELECT COUNT(*) FROM picks p WHERE p.game_id = g.id AND p.selected_team IN (g.home_team, g.away_team)) +
        (SELECT COUNT(*) FROM anonymous_picks ap WHERE ap.game_id = g.id AND ap.selected_team IN (g.home_team, g.away_team))
    ) as actual_total_picks,
    g.total_picks as stored_total_picks
FROM games g
WHERE g.week = 1 AND g.season = 2025
ORDER BY g.kickoff_time
LIMIT 3;

-- Check total submissions across all games
SELECT 'Total Week 1 2025 Submissions' as debug_section;

SELECT 
    SUM(total_picks) as total_from_games_table,
    (
        (SELECT COUNT(*) FROM picks p JOIN games g ON p.game_id = g.id WHERE g.week = 1 AND g.season = 2025) +
        (SELECT COUNT(*) FROM anonymous_picks ap JOIN games g ON ap.game_id = g.id WHERE g.week = 1 AND g.season = 2025)
    ) as actual_total_picks
FROM games 
WHERE week = 1 AND season = 2025;