-- PICK PROCESSING DIAGNOSTIC - Run this in Supabase SQL Editor
-- This will show you exactly what's happening with Week 2 picks

SELECT 
    '🏈 GAME ANALYSIS' as section,
    g.away_team || ' @ ' || g.home_team as matchup,
    g.status,
    g.winner_against_spread,
    g.margin_bonus,
    COUNT(p.id) as regular_picks,
    COUNT(ap.id) as anonymous_picks,
    COUNT(p.id) + COUNT(ap.id) as total_picks,
    COUNT(CASE WHEN p.result IS NOT NULL THEN 1 END) as processed_regular_picks,
    COUNT(CASE WHEN ap.result IS NOT NULL THEN 1 END) as processed_anonymous_picks,
    COUNT(CASE WHEN p.result IS NOT NULL THEN 1 END) + COUNT(CASE WHEN ap.result IS NOT NULL THEN 1 END) as total_processed_picks,
    g.home_team_picks,
    g.away_team_picks,
    g.total_picks as game_stats_total,
    g.pick_stats_updated_at
FROM games g
LEFT JOIN picks p ON g.id = p.game_id  
LEFT JOIN anonymous_picks ap ON g.id = ap.game_id
WHERE g.season = 2025 AND g.week = 2
GROUP BY g.id, g.away_team, g.home_team, g.status, g.winner_against_spread, g.margin_bonus, 
         g.home_team_picks, g.away_team_picks, g.total_picks, g.pick_stats_updated_at
ORDER BY g.kickoff_time;

-- Separate query for overall Week 2 statistics
SELECT 
    '📊 WEEK SUMMARY' as section,
    'Total Week 2 Picks' as metric,
    COUNT(*) as count
FROM picks 
WHERE season = 2025 AND week = 2

UNION ALL

SELECT 
    '📊 WEEK SUMMARY' as section,
    'Total Anonymous Picks' as metric,
    COUNT(*) as count
FROM anonymous_picks 
WHERE season = 2025 AND week = 2

UNION ALL

SELECT 
    '📊 WEEK SUMMARY' as section,
    'Processed Regular Picks' as metric,
    COUNT(*) as count
FROM picks 
WHERE season = 2025 AND week = 2 AND result IS NOT NULL

UNION ALL

SELECT 
    '📊 WEEK SUMMARY' as section,
    'Processed Anonymous Picks' as metric,
    COUNT(*) as count
FROM anonymous_picks 
WHERE season = 2025 AND week = 2 AND result IS NOT NULL;

-- Check active triggers on games table
SELECT 
    '🔧 ACTIVE TRIGGERS' as section,
    trigger_name,
    event_manipulation,
    action_timing,
    'EXECUTE FUNCTION ' || action_statement as full_action
FROM information_schema.triggers 
WHERE event_object_table = 'games' 
  AND trigger_schema = 'public'
  AND trigger_name NOT LIKE '%_old_%'  -- Exclude old/disabled triggers
ORDER BY trigger_name;

-- Check active functions related to pick processing  
SELECT 
    '⚙️ PICK FUNCTIONS' as section,
    routine_name,
    routine_type,
    CASE 
        WHEN routine_name LIKE '%pick%' THEN '🎯 Pick-related'
        WHEN routine_name LIKE '%game%' THEN '🏈 Game-related' 
        ELSE '📊 Other'
    END as category
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND (routine_name LIKE '%pick%' OR routine_name LIKE '%game%completion%' OR routine_name LIKE '%process%')
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;

-- Check if manual pick processing functions exist
SELECT 
    '🛠️ MANUAL FUNCTIONS' as section,
    routine_name,
    'Available for manual execution' as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN (
    'update_week_game_pick_counts',
    'process_picks_on_completion', 
    'calculate_game_winner_and_bonus',
    'update_picks_scoring_for_game'
  )
ORDER BY routine_name;