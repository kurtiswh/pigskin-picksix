-- URGENT FIX: Column name mismatch in weekly_leaderboard
-- 
-- Problem: Some functions try to insert/update 'points' column but table uses 'total_points'
-- Solution: Fix the function that's causing the error

-- Step 1: Check what columns actually exist in weekly_leaderboard
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'weekly_leaderboard' 
  AND table_schema = 'public'
ORDER BY ordinal_position;

-- Step 2: Fix the problematic function (update_weekly_leaderboard_with_source)
-- This is from migration 127 that has the wrong column name

CREATE OR REPLACE FUNCTION public.update_weekly_leaderboard_with_source(
    target_user_id UUID,
    target_week INTEGER,
    target_season INTEGER,
    pick_source TEXT DEFAULT NULL
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_stats RECORD;
    auth_stats RECORD;
    anon_stats RECORD;
    final_source VARCHAR(20);
    final_is_verified BOOLEAN := false;
    user_display_name TEXT;
BEGIN
    -- Get user display name
    SELECT display_name INTO user_display_name
    FROM public.users 
    WHERE id = target_user_id;
    
    IF user_display_name IS NULL THEN
        RETURN; -- User doesn't exist
    END IF;
    
    -- Get authenticated picks stats
    SELECT 
        COUNT(p.id) as picks_made,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points
    INTO auth_stats
    FROM public.picks p 
    WHERE p.user_id = target_user_id 
        AND p.week = target_week
        AND p.season = target_season
        AND p.submitted_at IS NOT NULL;
    
    -- Get anonymous picks stats (only those that should show on leaderboard)
    SELECT 
        COUNT(ap.id) as anon_picks,
        COUNT(CASE WHEN ap.result = 'win' THEN 1 END) as anon_wins,
        COUNT(CASE WHEN ap.result = 'loss' THEN 1 END) as anon_losses,
        COUNT(CASE WHEN ap.result = 'push' THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN ap.result = 'win' AND ap.is_lock THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN ap.result = 'loss' AND ap.is_lock THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(ap.points_earned), 0) as anon_points
    INTO anon_stats
    FROM public.anonymous_picks ap
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.week = target_week
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = true
        AND ap.validation_status IN ('auto_validated', 'manually_validated');
    
    -- Determine final pick source
    final_source := CASE 
        WHEN COALESCE(auth_stats.picks_made, 0) > 0 AND COALESCE(anon_stats.anon_picks, 0) > 0 THEN 'mixed'
        WHEN COALESCE(anon_stats.anon_picks, 0) > 0 THEN 'anonymous'
        ELSE 'authenticated'
    END;
    
    -- Only insert/update if user has any picks
    IF COALESCE(auth_stats.picks_made, 0) + COALESCE(anon_stats.anon_picks, 0) > 0 THEN
        -- Insert or update weekly leaderboard (FIXED: use total_points not points)
        INSERT INTO public.weekly_leaderboard (
            user_id, week, season, display_name, total_points, wins, losses, pushes,
            lock_wins, lock_losses, pick_source, is_verified
        ) VALUES (
            target_user_id, 
            target_week, 
            target_season, 
            user_display_name, 
            (COALESCE(auth_stats.total_points, 0) + COALESCE(anon_stats.anon_points, 0)),
            (COALESCE(auth_stats.wins, 0) + COALESCE(anon_stats.anon_wins, 0)), 
            (COALESCE(auth_stats.losses, 0) + COALESCE(anon_stats.anon_losses, 0)), 
            (COALESCE(auth_stats.pushes, 0) + COALESCE(anon_stats.anon_pushes, 0)),
            (COALESCE(auth_stats.lock_wins, 0) + COALESCE(anon_stats.anon_lock_wins, 0)), 
            (COALESCE(auth_stats.lock_losses, 0) + COALESCE(anon_stats.anon_lock_losses, 0)), 
            final_source, 
            final_is_verified
        )
        ON CONFLICT (user_id, week, season) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            total_points = EXCLUDED.total_points,
            wins = EXCLUDED.wins,
            losses = EXCLUDED.losses,
            pushes = EXCLUDED.pushes,
            lock_wins = EXCLUDED.lock_wins,
            lock_losses = EXCLUDED.lock_losses,
            pick_source = EXCLUDED.pick_source,
            is_verified = EXCLUDED.is_verified;
    END IF;
END;
$$;

-- Step 3: Now try the rollback again
SELECT public.refresh_all_leaderboards(2025);

-- Step 4: Verify the fix worked by checking a few users
SELECT 
    'After Fix - Mixed Pick Users Check' as check_type,
    display_name,
    total_points,
    pick_source,
    season_rank
FROM season_leaderboard 
WHERE season = 2025 
    AND pick_source = 'mixed'
ORDER BY total_points DESC
LIMIT 5;