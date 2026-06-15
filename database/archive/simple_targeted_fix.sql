-- SIMPLE SOLUTION: Use existing working functions instead of broken refresh_all_leaderboards
-- 
-- Instead of fixing the complex refresh_all_leaderboards function, let's just use 
-- the existing working recalculate functions for specific users

-- Step 1: Fix JAMES WELIN specifically using existing working functions
SELECT 'Fixing JAMES WELIN using existing functions...' as status;

-- These functions already exist and work (they're used by triggers)
SELECT public.recalculate_season_leaderboard_for_user(
    '4a139fa2-b582-433b-8908-63681add1919'::uuid,
    2025
);

SELECT public.recalculate_weekly_leaderboard_for_user(
    '4a139fa2-b582-433b-8908-63681add1919'::uuid,
    1,
    2025
);

-- Step 2: Fix all mixed pick users that were broken by my earlier attempt
-- Let's get the UUIDs for the affected users first
WITH affected_users AS (
    SELECT u.id, u.display_name 
    FROM users u 
    WHERE u.display_name IN ('Collins Orr', 'Will Hathorn', 'Aaron Bowser', 'PATRICK M', 'Stuart Rowlan', 'Adam Barbee')
)
SELECT 
    'Fixing mixed pick users...' as operation,
    display_name,
    id
FROM affected_users;

-- Step 3: Recalculate each affected user individually using existing functions
-- Collins Orr
SELECT public.recalculate_season_leaderboard_for_user(
    (SELECT id FROM users WHERE display_name = 'Collins Orr'),
    2025
);

-- Will Hathorn  
SELECT public.recalculate_season_leaderboard_for_user(
    (SELECT id FROM users WHERE display_name = 'Will Hathorn'),
    2025
);

-- Aaron Bowser
SELECT public.recalculate_season_leaderboard_for_user(
    (SELECT id FROM users WHERE display_name = 'Aaron Bowser'),
    2025
);

-- PATRICK M
SELECT public.recalculate_season_leaderboard_for_user(
    (SELECT id FROM users WHERE display_name = 'PATRICK M'),
    2025
);

-- Stuart Rowlan
SELECT public.recalculate_season_leaderboard_for_user(
    (SELECT id FROM users WHERE display_name = 'Stuart Rowlan'),
    2025
);

-- Adam Barbee
SELECT public.recalculate_season_leaderboard_for_user(
    (SELECT id FROM users WHERE display_name = 'Adam Barbee'),
    2025
);

-- Step 4: Update season rankings manually (simpler than fixing the broken ranking function)
UPDATE public.season_leaderboard 
SET season_rank = subq.rank
FROM (
    SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
    FROM public.season_leaderboard
    WHERE season = 2025
) subq
WHERE public.season_leaderboard.id = subq.id
    AND public.season_leaderboard.season = 2025;

-- Step 5: Verify the fix worked
SELECT 
    'FINAL VERIFICATION - Top Season Leaders' as check_type,
    display_name,
    total_points,
    pick_source,
    season_rank
FROM season_leaderboard 
WHERE season = 2025
ORDER BY season_rank
LIMIT 10;