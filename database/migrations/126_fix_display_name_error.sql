-- Migration 126: Fix display_name field access error in leaderboard functions
-- 
-- PURPOSE: Fix the "record has no field display_name" error by properly
-- handling the display_name field in the leaderboard update functions.

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 126: Fix display_name field access error';
    RAISE NOTICE '===================================================';
END;
$$;

-- Fix the season leaderboard function to handle display_name properly
CREATE OR REPLACE FUNCTION public.update_season_leaderboard_with_source(
    target_user_id UUID,
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
    final_source TEXT;
    final_is_verified BOOLEAN := false;
    user_display_name TEXT;
BEGIN
    -- Get authenticated picks stats (only visible in combination)
    SELECT 
        COALESCE(SUM(CASE WHEN p.result = 'win' THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN p.result = 'loss' THEN 1 ELSE 0 END), 0) as losses,
        COALESCE(SUM(CASE WHEN p.result = 'push' THEN 1 ELSE 0 END), 0) as pushes,
        COALESCE(SUM(CASE WHEN p.result = 'win' AND (COALESCE(p.combination_is_lock, p.is_lock) = true) THEN 1 ELSE 0 END), 0) as lock_wins,
        COALESCE(SUM(CASE WHEN p.result = 'loss' AND (COALESCE(p.combination_is_lock, p.is_lock) = true) THEN 1 ELSE 0 END), 0) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points,
        COUNT(*) as pick_count
    INTO auth_stats
    FROM public.picks p
    WHERE p.user_id = target_user_id 
      AND p.season = target_season
      AND p.submitted_at IS NOT NULL
      AND p.show_in_combination = true  -- Only count visible picks
      AND p.result IS NOT NULL;

    -- Get anonymous picks stats (only visible in combination)  
    SELECT 
        COALESCE(SUM(CASE WHEN ap.result = 'win' THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN ap.result = 'loss' THEN 1 ELSE 0 END), 0) as losses,
        COALESCE(SUM(CASE WHEN ap.result = 'push' THEN 1 ELSE 0 END), 0) as pushes,
        COALESCE(SUM(CASE WHEN ap.result = 'win' AND (COALESCE(ap.combination_is_lock, ap.is_lock) = true) THEN 1 ELSE 0 END), 0) as lock_wins,
        COALESCE(SUM(CASE WHEN ap.result = 'loss' AND (COALESCE(ap.combination_is_lock, ap.is_lock) = true) THEN 1 ELSE 0 END), 0) as lock_losses,
        COALESCE(SUM(ap.points_earned), 0) as total_points,
        COUNT(*) as pick_count
    INTO anon_stats
    FROM public.anonymous_picks ap
    WHERE ap.assigned_user_id = target_user_id 
      AND ap.season = target_season
      AND ap.show_on_leaderboard = true
      AND ap.show_in_combination = true  -- Only count visible picks
      AND ap.validation_status IN ('auto_validated', 'manually_validated')
      AND ap.result IS NOT NULL;

    -- Determine final source and verification status
    IF auth_stats.pick_count > 0 AND anon_stats.pick_count > 0 THEN
        final_source := 'mixed';
        final_is_verified := true; -- Mixed sources include verified account
    ELSIF auth_stats.pick_count > 0 THEN
        final_source := 'authenticated';
        final_is_verified := true;
    ELSIF anon_stats.pick_count > 0 THEN
        final_source := 'anonymous';
        final_is_verified := false;
    ELSE
        -- No visible picks, remove from leaderboard
        DELETE FROM public.season_leaderboard 
        WHERE user_id = target_user_id AND season = target_season;
        RETURN;
    END IF;

    -- Get user display name separately
    SELECT u.display_name INTO user_display_name
    FROM public.users u WHERE u.id = target_user_id;

    -- Calculate combined stats directly
    INSERT INTO public.season_leaderboard (
        user_id, season, display_name, total_points, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, pick_source, is_verified, last_updated
    ) VALUES (
        target_user_id, 
        target_season, 
        user_display_name, 
        (auth_stats.total_points + anon_stats.total_points),
        (auth_stats.wins + anon_stats.wins), 
        (auth_stats.losses + anon_stats.losses), 
        (auth_stats.pushes + anon_stats.pushes),
        (auth_stats.lock_wins + anon_stats.lock_wins), 
        (auth_stats.lock_losses + anon_stats.lock_losses), 
        final_source, 
        final_is_verified, 
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, season) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        total_points = EXCLUDED.total_points,
        total_wins = EXCLUDED.total_wins,
        total_losses = EXCLUDED.total_losses, 
        total_pushes = EXCLUDED.total_pushes,
        lock_wins = EXCLUDED.lock_wins,
        lock_losses = EXCLUDED.lock_losses,
        pick_source = EXCLUDED.pick_source,
        is_verified = EXCLUDED.is_verified,
        last_updated = EXCLUDED.last_updated;

    RAISE NOTICE '✅ Updated season leaderboard for user % (% picks, % points)', 
        target_user_id, (auth_stats.pick_count + anon_stats.pick_count), (auth_stats.total_points + anon_stats.total_points);
END;
$$;

-- Fix the weekly leaderboard function similarly
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
    final_source TEXT;
    final_is_verified BOOLEAN := false;
    user_display_name TEXT;
BEGIN
    -- Get authenticated picks stats for the week (only visible in combination)
    SELECT 
        COALESCE(SUM(CASE WHEN p.result = 'win' THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN p.result = 'loss' THEN 1 ELSE 0 END), 0) as losses,
        COALESCE(SUM(CASE WHEN p.result = 'push' THEN 1 ELSE 0 END), 0) as pushes,
        COALESCE(SUM(CASE WHEN p.result = 'win' AND (COALESCE(p.combination_is_lock, p.is_lock) = true) THEN 1 ELSE 0 END), 0) as lock_wins,
        COALESCE(SUM(CASE WHEN p.result = 'loss' AND (COALESCE(p.combination_is_lock, p.is_lock) = true) THEN 1 ELSE 0 END), 0) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points,
        COUNT(*) as pick_count
    INTO auth_stats
    FROM public.picks p
    WHERE p.user_id = target_user_id 
      AND p.week = target_week
      AND p.season = target_season
      AND p.submitted_at IS NOT NULL
      AND p.show_in_combination = true  -- Only count visible picks
      AND p.result IS NOT NULL;

    -- Get anonymous picks stats for the week (only visible in combination)
    SELECT 
        COALESCE(SUM(CASE WHEN ap.result = 'win' THEN 1 ELSE 0 END), 0) as wins,
        COALESCE(SUM(CASE WHEN ap.result = 'loss' THEN 1 ELSE 0 END), 0) as losses,
        COALESCE(SUM(CASE WHEN ap.result = 'push' THEN 1 ELSE 0 END), 0) as pushes,
        COALESCE(SUM(CASE WHEN ap.result = 'win' AND (COALESCE(ap.combination_is_lock, ap.is_lock) = true) THEN 1 ELSE 0 END), 0) as lock_wins,
        COALESCE(SUM(CASE WHEN ap.result = 'loss' AND (COALESCE(ap.combination_is_lock, ap.is_lock) = true) THEN 1 ELSE 0 END), 0) as lock_losses,
        COALESCE(SUM(ap.points_earned), 0) as total_points,
        COUNT(*) as pick_count
    INTO anon_stats
    FROM public.anonymous_picks ap
    WHERE ap.assigned_user_id = target_user_id 
      AND ap.week = target_week
      AND ap.season = target_season
      AND ap.show_on_leaderboard = true
      AND ap.show_in_combination = true  -- Only count visible picks
      AND ap.validation_status IN ('auto_validated', 'manually_validated')
      AND ap.result IS NOT NULL;

    -- Determine final source and verification status
    IF auth_stats.pick_count > 0 AND anon_stats.pick_count > 0 THEN
        final_source := 'mixed';
        final_is_verified := true;
    ELSIF auth_stats.pick_count > 0 THEN
        final_source := 'authenticated';
        final_is_verified := true;
    ELSIF anon_stats.pick_count > 0 THEN
        final_source := 'anonymous';
        final_is_verified := false;
    ELSE
        -- No visible picks, remove from weekly leaderboard
        DELETE FROM public.weekly_leaderboard 
        WHERE user_id = target_user_id AND week = target_week AND season = target_season;
        RETURN;
    END IF;

    -- Get user display name separately
    SELECT u.display_name INTO user_display_name
    FROM public.users u WHERE u.id = target_user_id;

    -- Calculate combined stats directly
    INSERT INTO public.weekly_leaderboard (
        user_id, week, season, display_name, points, wins, losses, pushes,
        lock_wins, lock_losses, pick_source, is_verified, last_updated
    ) VALUES (
        target_user_id, 
        target_week, 
        target_season, 
        user_display_name, 
        (auth_stats.total_points + anon_stats.total_points),
        (auth_stats.wins + anon_stats.wins), 
        (auth_stats.losses + anon_stats.losses), 
        (auth_stats.pushes + anon_stats.pushes),
        (auth_stats.lock_wins + anon_stats.lock_wins), 
        (auth_stats.lock_losses + anon_stats.lock_losses), 
        final_source, 
        final_is_verified, 
        CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, week, season) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        points = EXCLUDED.points,
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        pushes = EXCLUDED.pushes,
        lock_wins = EXCLUDED.lock_wins,
        lock_losses = EXCLUDED.lock_losses,
        pick_source = EXCLUDED.pick_source,
        is_verified = EXCLUDED.is_verified,
        last_updated = EXCLUDED.last_updated;

    RAISE NOTICE '✅ Updated weekly leaderboard for user % week % (% picks, % points)', 
        target_user_id, target_week, (auth_stats.pick_count + anon_stats.pick_count), (auth_stats.total_points + anon_stats.total_points);
END;
$$;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 126 COMPLETED - Fixed display_name field access error!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 FIXED ISSUES:';
    RAISE NOTICE '• Removed user_stats.display_name field access';
    RAISE NOTICE '• Query display_name separately from users table';
    RAISE NOTICE '• Use direct calculation instead of record access';
    RAISE NOTICE '';
    RAISE NOTICE '💾 Custom pick combination saves should now work!';
END;
$$;