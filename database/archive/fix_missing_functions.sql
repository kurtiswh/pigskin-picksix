-- URGENT FIX: Create missing ranking functions that refresh_all_leaderboards needs
-- 
-- The refresh_all_leaderboards function is trying to call functions that don't exist
-- Let's create them quickly

-- Step 1: Create the missing update_season_rankings function
CREATE OR REPLACE FUNCTION public.update_season_rankings(target_season INTEGER)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    -- Update season rankings for all users in the target season
    UPDATE public.season_leaderboard 
    SET season_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.season_leaderboard
        WHERE season = target_season
    ) subq
    WHERE public.season_leaderboard.id = subq.id
        AND public.season_leaderboard.season = target_season;
END;
$$;

-- Step 2: Create the missing update_weekly_rankings function (if needed)
CREATE OR REPLACE FUNCTION public.update_weekly_rankings(
    target_season INTEGER, 
    target_week INTEGER
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    -- Update weekly rankings for all users in the target week/season
    UPDATE public.weekly_leaderboard 
    SET weekly_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.weekly_leaderboard
        WHERE week = target_week AND season = target_season
    ) subq
    WHERE public.weekly_leaderboard.id = subq.id
        AND public.weekly_leaderboard.week = target_week
        AND public.weekly_leaderboard.season = target_season;
END;
$$;

-- Step 3: Check if refresh_all_leaderboards exists and works now
SELECT 'Functions created, testing refresh_all_leaderboards...' as status;

-- Step 4: Try the rollback again (this should work now)
SELECT public.refresh_all_leaderboards(2025);

-- Step 5: Quick check of results
SELECT 
    'After Full Fix - Top 10 Season Leaders' as check_type,
    display_name,
    total_points,
    pick_source,
    season_rank
FROM season_leaderboard 
WHERE season = 2025
ORDER BY season_rank
LIMIT 10;