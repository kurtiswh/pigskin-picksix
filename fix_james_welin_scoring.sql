-- Fix JAMES WELIN's Double-Counting Anonymous Picks Issue
-- User ID: 4a139fa2-b582-433b-8908-63681add1919
-- Issue: Multiple anonymous pick sets causing double points

-- Step 1: Diagnose the issue
SELECT 
    'Before Fix - Anonymous Picks Analysis' as operation,
    ap.game_id,
    g.home_team,
    g.away_team, 
    ap.selected_team,
    ap.is_lock,
    ap.show_on_leaderboard,
    ap.points_earned,
    ap.result,
    ap.validation_status,
    ap.processing_notes
FROM anonymous_picks ap
JOIN games g ON ap.game_id = g.id
WHERE ap.assigned_user_id = '4a139fa2-b582-433b-8908-63681add1919'
    AND ap.season = 2025
    AND ap.week = 1
ORDER BY g.home_team, g.away_team, ap.show_on_leaderboard DESC;

-- Step 2: Check current leaderboard entry
SELECT 
    'Before Fix - Current Leaderboard Entry' as operation,
    sl.user_id,
    sl.display_name,
    sl.total_points,
    sl.total_wins,
    sl.total_losses,
    sl.total_pushes,
    sl.pick_source,
    sl.season_rank
FROM season_leaderboard sl
WHERE sl.user_id = '4a139fa2-b582-433b-8908-63681add1919'
    AND sl.season = 2025;

-- Step 3: Fix the scoring by recalculating correctly
-- Force recalculation for this specific user
SELECT public.recalculate_season_leaderboard_for_user(
    '4a139fa2-b582-433b-8908-63681add1919'::uuid,
    2025
);

SELECT public.recalculate_weekly_leaderboard_for_user(
    '4a139fa2-b582-433b-8908-63681add1919'::uuid,
    1,
    2025
);

-- Step 4: Update rankings
UPDATE public.season_leaderboard 
SET season_rank = subq.rank
FROM (
    SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
    FROM public.season_leaderboard
    WHERE season = 2025
) subq
WHERE public.season_leaderboard.id = subq.id;

UPDATE public.weekly_leaderboard 
SET weekly_rank = subq.rank
FROM (
    SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
    FROM public.weekly_leaderboard
    WHERE week = 1 AND season = 2025
) subq
WHERE public.weekly_leaderboard.id = subq.id;

-- Step 5: Verify the fix
SELECT 
    'After Fix - Anonymous Picks (Should show only show_on_leaderboard=true counted)' as operation,
    COUNT(*) as total_anonymous_picks,
    COUNT(CASE WHEN show_on_leaderboard = true THEN 1 END) as visible_picks,
    COUNT(CASE WHEN show_on_leaderboard = false THEN 1 END) as hidden_picks,
    SUM(CASE WHEN show_on_leaderboard = true THEN points_earned ELSE 0 END) as points_from_visible_picks
FROM anonymous_picks ap
WHERE ap.assigned_user_id = '4a139fa2-b582-433b-8908-63681add1919'
    AND ap.season = 2025
    AND ap.week = 1;

-- Step 6: Check final leaderboard entry
SELECT 
    'After Fix - Updated Leaderboard Entry' as operation,
    sl.user_id,
    sl.display_name,
    sl.total_points,
    sl.total_wins,
    sl.total_losses,
    sl.total_pushes,
    sl.pick_source,
    sl.season_rank
FROM season_leaderboard sl
WHERE sl.user_id = '4a139fa2-b582-433b-8908-63681add1919'
    AND sl.season = 2025;

-- Step 7: Check weekly leaderboard too
SELECT 
    'After Fix - Weekly Leaderboard Entry' as operation,
    wl.user_id,
    wl.display_name,
    wl.total_points,
    wl.wins,
    wl.losses,
    wl.pushes,
    wl.pick_source,
    wl.weekly_rank
FROM weekly_leaderboard wl
WHERE wl.user_id = '4a139fa2-b582-433b-8908-63681add1919'
    AND wl.season = 2025
    AND wl.week = 1;