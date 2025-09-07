-- DIRECT FIX: Clear pick results for non-completed games
-- Simple UPDATE statements - run in Supabase SQL Editor

-- Step 1: Clear pick results for non-completed games
UPDATE picks 
SET result = NULL, points_earned = NULL, updated_at = CURRENT_TIMESTAMP
WHERE game_id IN (
    SELECT id FROM games 
    WHERE season = 2025 AND week = 2 AND status != 'completed'
);

-- Step 2: Clear anonymous pick results for non-completed games  
UPDATE anonymous_picks
SET result = NULL, points_earned = NULL, updated_at = CURRENT_TIMESTAMP
WHERE game_id IN (
    SELECT id FROM games 
    WHERE season = 2025 AND week = 2 AND status != 'completed'
);

-- Step 3: Clear game winner data for non-completed games
UPDATE games 
SET winner_against_spread = NULL, margin_bonus = NULL, base_points = NULL, updated_at = CURRENT_TIMESTAMP
WHERE season = 2025 AND week = 2 AND status != 'completed';

-- Step 4: Verify the fix
SELECT 
    g.home_team, g.away_team, g.status,
    g.winner_against_spread,
    COUNT(p.result) as picks_with_results,
    COUNT(ap.result) as anon_picks_with_results
FROM games g
LEFT JOIN picks p ON g.id = p.game_id AND p.result IS NOT NULL
LEFT JOIN anonymous_picks ap ON g.id = ap.game_id AND ap.result IS NOT NULL
WHERE g.season = 2025 AND g.week = 2
GROUP BY g.id, g.home_team, g.away_team, g.status, g.winner_against_spread
ORDER BY g.status, g.home_team;