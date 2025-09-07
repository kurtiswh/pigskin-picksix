-- Check how many pick records we need to update
-- Run this first to see the scope of the problem

SELECT 
    g.home_team,
    g.away_team, 
    g.status,
    g.winner_against_spread IS NOT NULL as has_winner,
    COUNT(p.id) as total_picks,
    COUNT(CASE WHEN p.result IS NOT NULL THEN 1 END) as picks_with_results,
    COUNT(ap.id) as total_anon_picks,
    COUNT(CASE WHEN ap.result IS NOT NULL THEN 1 END) as anon_picks_with_results
FROM games g
LEFT JOIN picks p ON g.id = p.game_id
LEFT JOIN anonymous_picks ap ON g.id = ap.game_id
WHERE g.season = 2025 AND g.week = 2 AND g.status != 'completed'
GROUP BY g.id, g.home_team, g.away_team, g.status, g.winner_against_spread
ORDER BY total_picks DESC;