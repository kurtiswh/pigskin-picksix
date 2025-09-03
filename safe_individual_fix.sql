-- SAFE FIX: Handle duplicate display names properly
-- 
-- The error occurs because there are multiple users with the same display_name
-- Let's fix this more safely by finding users first, then fixing them individually

-- Step 1: First, let's see what users we're dealing with
SELECT 
    'Current Mixed Pick Users in Season Leaderboard' as info,
    id,
    user_id, 
    display_name,
    total_points,
    pick_source,
    season_rank
FROM season_leaderboard 
WHERE season = 2025 
    AND pick_source = 'mixed'
ORDER BY total_points DESC;

-- Step 2: Fix JAMES WELIN first (we know his UUID)
SELECT 'Fixing JAMES WELIN...' as status;

SELECT public.recalculate_season_leaderboard_for_user(
    '4a139fa2-b582-433b-8908-63681add1919'::uuid,
    2025
);

SELECT public.recalculate_weekly_leaderboard_for_user(
    '4a139fa2-b582-433b-8908-63681add1919'::uuid,
    1,
    2025
);

-- Step 3: Get all mixed pick users from the current leaderboard and fix them
-- This is safer than trying to match by display_name
DO $$
DECLARE
    user_record RECORD;
BEGIN
    -- Loop through all mixed pick users in the season leaderboard
    FOR user_record IN 
        SELECT DISTINCT user_id, display_name
        FROM season_leaderboard 
        WHERE season = 2025 
            AND pick_source = 'mixed'
            AND user_id != '4a139fa2-b582-433b-8908-63681add1919'::uuid -- Skip JAMES WELIN (already done)
    LOOP
        RAISE NOTICE 'Recalculating for user: % (ID: %)', user_record.display_name, user_record.user_id;
        
        -- Recalculate season leaderboard for this user
        PERFORM public.recalculate_season_leaderboard_for_user(
            user_record.user_id,
            2025
        );
        
        -- Also recalculate weekly for week 1 (assuming that's where most picks are)
        PERFORM public.recalculate_weekly_leaderboard_for_user(
            user_record.user_id,
            1,
            2025
        );
    END LOOP;
    
    RAISE NOTICE 'Completed recalculation for all mixed pick users';
END $$;

-- Step 4: Update season rankings manually
UPDATE public.season_leaderboard 
SET season_rank = subq.rank
FROM (
    SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
    FROM public.season_leaderboard
    WHERE season = 2025
) subq
WHERE public.season_leaderboard.id = subq.id
    AND public.season_leaderboard.season = 2025;

-- Step 5: Also update weekly rankings for week 1
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

-- Step 6: Final verification
SELECT 
    'AFTER FIX - Top Season Leaders' as check_type,
    display_name,
    total_points,
    pick_source,
    season_rank
FROM season_leaderboard 
WHERE season = 2025
ORDER BY season_rank
LIMIT 10;

-- Step 7: Check JAMES WELIN specifically
SELECT 
    'JAMES WELIN After Fix' as check_type,
    display_name,
    total_points,
    pick_source,
    season_rank,
    total_wins,
    total_losses,
    total_pushes
FROM season_leaderboard 
WHERE season = 2025
    AND user_id = '4a139fa2-b582-433b-8908-63681add1919'::uuid;