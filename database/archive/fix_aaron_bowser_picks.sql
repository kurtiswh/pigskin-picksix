-- Fix Aaron Bowser's Anonymous Picks Calculation
-- 
-- Aaron Bowser has anonymous picks set to show_on_leaderboard=true but showing 0-0 record

-- Step 1: Find Aaron Bowser's user ID
SELECT 
    'Aaron Bowser User Lookup' as operation,
    id as user_id,
    display_name,
    email
FROM users 
WHERE display_name ILIKE '%aaron%bowser%' OR display_name ILIKE '%bowser%';

-- Step 2: Check his current anonymous picks status
SELECT 
    'Aaron Bowser Anonymous Picks Analysis' as operation,
    ap.assigned_user_id,
    ap.season,
    ap.week,
    ap.show_on_leaderboard,
    ap.validation_status,
    ap.result,
    ap.points_earned,
    ap.selected_team,
    ap.is_lock,
    g.home_team || ' vs ' || g.away_team as matchup,
    g.status as game_status
FROM anonymous_picks ap
JOIN games g ON ap.game_id = g.id
WHERE ap.assigned_user_id = (
    SELECT id FROM users WHERE display_name ILIKE '%aaron%bowser%' OR display_name ILIKE '%bowser%' LIMIT 1
)
    AND ap.season = 2025
    AND ap.week = 1
ORDER BY g.kickoff_time;

-- Step 3: Check his current leaderboard entries
SELECT 
    'Aaron Bowser Current Leaderboard Status' as operation,
    'Season' as leaderboard_type,
    sl.display_name,
    sl.total_points,
    sl.total_wins,
    sl.total_losses,
    sl.total_pushes,
    sl.pick_source,
    sl.season_rank
FROM season_leaderboard sl
WHERE sl.user_id = (
    SELECT id FROM users WHERE display_name ILIKE '%aaron%bowser%' OR display_name ILIKE '%bowser%' LIMIT 1
)
    AND sl.season = 2025

UNION ALL

SELECT 
    'Aaron Bowser Current Leaderboard Status' as operation,
    'Weekly' as leaderboard_type,
    wl.display_name,
    wl.total_points,
    wl.wins,
    wl.losses,
    wl.pushes,
    wl.pick_source,
    wl.weekly_rank
FROM weekly_leaderboard wl
WHERE wl.user_id = (
    SELECT id FROM users WHERE display_name ILIKE '%aaron%bowser%' OR display_name ILIKE '%bowser%' LIMIT 1
)
    AND wl.season = 2025
    AND wl.week = 1;

-- Step 4: Recalculate Aaron Bowser's picks using the working functions
-- Get his actual user ID first
DO $$
DECLARE
    aaron_user_id UUID;
BEGIN
    -- Find Aaron Bowser's user ID
    SELECT id INTO aaron_user_id
    FROM users 
    WHERE display_name ILIKE '%aaron%bowser%' OR display_name ILIKE '%bowser%'
    LIMIT 1;
    
    IF aaron_user_id IS NULL THEN
        RAISE NOTICE '❌ Could not find Aaron Bowser in users table';
        RETURN;
    END IF;
    
    RAISE NOTICE '🎯 Found Aaron Bowser: %', aaron_user_id;
    
    -- Recalculate his season leaderboard
    RAISE NOTICE '🔄 Recalculating season leaderboard for Aaron Bowser...';
    PERFORM public.recalculate_season_leaderboard_for_user(aaron_user_id, 2025);
    
    -- Recalculate his weekly leaderboard for week 1
    RAISE NOTICE '🔄 Recalculating weekly leaderboard for Aaron Bowser Week 1...';
    PERFORM public.recalculate_weekly_leaderboard_for_user(aaron_user_id, 1, 2025);
    
    RAISE NOTICE '✅ Recalculation completed for Aaron Bowser';
END $$;

-- Step 5: Update rankings after recalculation
UPDATE public.season_leaderboard 
SET season_rank = subq.rank
FROM (
    SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
    FROM public.season_leaderboard
    WHERE season = 2025
) subq
WHERE public.season_leaderboard.id = subq.id
    AND public.season_leaderboard.season = 2025;

UPDATE public.weekly_leaderboard 
SET weekly_rank = subq.rank
FROM (
    SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
    FROM public.weekly_leaderboard
    WHERE season = 2025 AND week = 1
) subq
WHERE public.weekly_leaderboard.id = subq.id
    AND public.weekly_leaderboard.season = 2025
    AND public.weekly_leaderboard.week = 1;

-- Step 6: Verify the fix worked
SELECT 
    'AFTER FIX - Aaron Bowser Leaderboard Status' as operation,
    'Season' as leaderboard_type,
    sl.display_name,
    sl.total_points,
    sl.total_wins,
    sl.total_losses,
    sl.total_pushes,
    sl.pick_source,
    sl.season_rank
FROM season_leaderboard sl
WHERE sl.user_id = (
    SELECT id FROM users WHERE display_name ILIKE '%aaron%bowser%' OR display_name ILIKE '%bowser%' LIMIT 1
)
    AND sl.season = 2025

UNION ALL

SELECT 
    'AFTER FIX - Aaron Bowser Leaderboard Status' as operation,
    'Weekly' as leaderboard_type,
    wl.display_name,
    wl.total_points,
    wl.wins,
    wl.losses,
    wl.pushes,
    wl.pick_source,
    wl.weekly_rank
FROM weekly_leaderboard wl
WHERE wl.user_id = (
    SELECT id FROM users WHERE display_name ILIKE '%aaron%bowser%' OR display_name ILIKE '%bowser%' LIMIT 1
)
    AND wl.season = 2025
    AND wl.week = 1;