-- ROLLBACK AND PROPER FIX FOR MIXED PICK SETS
-- 
-- Issue: The previous fix broke mixed pick set scoring
-- Solution: Rollback all affected users and apply targeted fix

-- Step 1: Rollback - Recalculate ALL users for 2025 to restore proper mixed scoring
SELECT public.refresh_all_leaderboards(2025);

-- Step 2: Specific Analysis - Let's see what's wrong with JAMES WELIN specifically
-- This will help us understand the exact issue without breaking others

-- Check all his picks first
SELECT 
    'JAMES WELIN Analysis - All Pick Types' as analysis_type,
    'Authenticated Picks' as pick_type,
    p.game_id,
    g.home_team || ' vs ' || g.away_team as matchup,
    p.selected_team,
    p.is_lock,
    p.result,
    p.points_earned,
    'N/A' as show_on_leaderboard
FROM picks p
JOIN games g ON p.game_id = g.id
WHERE p.user_id = '4a139fa2-b582-433b-8908-63681add1919'
    AND p.season = 2025
    AND p.week = 1

UNION ALL

SELECT 
    'JAMES WELIN Analysis - All Pick Types' as analysis_type,
    'Anonymous Picks' as pick_type,
    ap.game_id,
    g.home_team || ' vs ' || g.away_team as matchup,
    ap.selected_team,
    ap.is_lock,
    ap.result,
    ap.points_earned,
    ap.show_on_leaderboard::text
FROM anonymous_picks ap
JOIN games g ON ap.game_id = g.id
WHERE ap.assigned_user_id = '4a139fa2-b582-433b-8908-63681add1919'
    AND ap.season = 2025
    AND ap.week = 1
ORDER BY matchup, pick_type DESC;

-- Step 3: Check for duplicate games (this is likely the real issue)
SELECT 
    'Duplicate Game Analysis' as analysis,
    g.home_team || ' vs ' || g.away_team as matchup,
    COUNT(DISTINCT p.id) as auth_picks,
    COUNT(DISTINCT ap.id) as anon_picks,
    COUNT(DISTINCT CASE WHEN ap.show_on_leaderboard = true THEN ap.id END) as visible_anon_picks
FROM games g
LEFT JOIN picks p ON g.id = p.game_id 
    AND p.user_id = '4a139fa2-b582-433b-8908-63681add1919'
    AND p.season = 2025
    AND p.week = 1
LEFT JOIN anonymous_picks ap ON g.id = ap.game_id
    AND ap.assigned_user_id = '4a139fa2-b582-433b-8908-63681add1919'
    AND ap.season = 2025 
    AND ap.week = 1
WHERE g.season = 2025 AND g.week = 1
    AND (p.id IS NOT NULL OR ap.id IS NOT NULL)
GROUP BY g.id, g.home_team, g.away_team
HAVING COUNT(DISTINCT p.id) > 0 AND COUNT(DISTINCT ap.id) > 0
ORDER BY matchup;

-- Step 4: Check current leaderboard status after rollback
SELECT 
    'Post-Rollback Leaderboard Check' as check_type,
    sl.display_name,
    sl.total_points,
    sl.pick_source,
    sl.season_rank
FROM season_leaderboard sl
WHERE sl.season = 2025
    AND sl.user_id IN (
        '4a139fa2-b582-433b-8908-63681add1919', -- JAMES WELIN
        (SELECT user_id FROM users WHERE display_name = 'Collins Orr'),
        (SELECT user_id FROM users WHERE display_name = 'Will Hathorn'),
        (SELECT user_id FROM users WHERE display_name = 'Aaron Bowser')
    )
ORDER BY sl.total_points DESC;

-- If JAMES WELIN still has the wrong score after rollback, we need to investigate
-- why the leaderboard recalculation functions aren't working properly