-- Migration 123: Update Leaderboard Functions for Combination Visibility
-- 
-- PURPOSE: Update all leaderboard calculation functions to respect the new
-- show_in_combination flags for individual pick visibility control.
-- This ensures leaderboards only score based on the selected custom combination picks.

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 123: Update leaderboard functions for combination visibility';
    RAISE NOTICE '======================================================================';
END;
$$;

-- Update season leaderboard calculation to use combination visibility
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

    -- Calculate combined stats
    SELECT
        (auth_stats.wins + anon_stats.wins) as total_wins,
        (auth_stats.losses + anon_stats.losses) as total_losses,
        (auth_stats.pushes + anon_stats.pushes) as total_pushes,
        (auth_stats.lock_wins + anon_stats.lock_wins) as lock_wins,
        (auth_stats.lock_losses + anon_stats.lock_losses) as lock_losses,
        (auth_stats.total_points + anon_stats.total_points) as total_points,
        (auth_stats.pick_count + anon_stats.pick_count) as total_picks
    INTO user_stats;

    -- Get user info
    SELECT u.display_name INTO user_stats.display_name
    FROM public.users u WHERE u.id = target_user_id;

    -- Insert or update season leaderboard
    INSERT INTO public.season_leaderboard (
        user_id, season, display_name, total_points, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, pick_source, is_verified, last_updated
    ) VALUES (
        target_user_id, target_season, user_stats.display_name, user_stats.total_points,
        user_stats.total_wins, user_stats.total_losses, user_stats.total_pushes,
        user_stats.lock_wins, user_stats.lock_losses, final_source, final_is_verified, CURRENT_TIMESTAMP
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
        target_user_id, user_stats.total_picks, user_stats.total_points;
END;
$$;

-- Update weekly leaderboard calculation to use combination visibility
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

    -- Calculate combined stats
    SELECT
        (auth_stats.wins + anon_stats.wins) as total_wins,
        (auth_stats.losses + anon_stats.losses) as total_losses,
        (auth_stats.pushes + anon_stats.pushes) as total_pushes,
        (auth_stats.lock_wins + anon_stats.lock_wins) as lock_wins,
        (auth_stats.lock_losses + anon_stats.lock_losses) as lock_losses,
        (auth_stats.total_points + anon_stats.total_points) as total_points,
        (auth_stats.pick_count + anon_stats.pick_count) as total_picks
    INTO user_stats;

    -- Get user info
    SELECT u.display_name INTO user_stats.display_name
    FROM public.users u WHERE u.id = target_user_id;

    -- Insert or update weekly leaderboard
    INSERT INTO public.weekly_leaderboard (
        user_id, week, season, display_name, points, wins, losses, pushes,
        lock_wins, lock_losses, pick_source, is_verified, last_updated
    ) VALUES (
        target_user_id, target_week, target_season, user_stats.display_name, user_stats.total_points,
        user_stats.total_wins, user_stats.total_losses, user_stats.total_pushes,
        user_stats.lock_wins, user_stats.lock_losses, final_source, final_is_verified, CURRENT_TIMESTAMP
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
        target_user_id, target_week, user_stats.total_picks, user_stats.total_points;
END;
$$;

-- Update the full refresh function to work with combination visibility
CREATE OR REPLACE FUNCTION public.refresh_all_leaderboards(
    target_season INTEGER
)
RETURNS TABLE(
    users_processed INTEGER,
    season_entries_updated INTEGER,
    weekly_entries_updated INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_rec RECORD;
    total_users INTEGER := 0;
    season_updates INTEGER := 0;
    weekly_updates INTEGER := 0;
    week_rec RECORD;
BEGIN
    RAISE NOTICE '🔄 Starting full leaderboard refresh for season % with combination visibility', target_season;
    
    -- Process all users who have visible picks (either authenticated or anonymous)
    FOR user_rec IN 
        SELECT DISTINCT user_id FROM (
            -- Users with visible authenticated picks
            SELECT DISTINCT user_id 
            FROM public.picks 
            WHERE season = target_season
            AND submitted_at IS NOT NULL
            AND show_in_combination = true  -- Only visible picks
            
            UNION
            
            -- Users with visible anonymous picks
            SELECT DISTINCT assigned_user_id as user_id
            FROM public.anonymous_picks
            WHERE season = target_season
            AND assigned_user_id IS NOT NULL
            AND show_on_leaderboard = true
            AND show_in_combination = true  -- Only visible picks
            AND validation_status IN ('auto_validated', 'manually_validated')
        ) all_users
    LOOP
        total_users := total_users + 1;
        
        -- Update season leaderboard
        PERFORM public.update_season_leaderboard_with_source(user_rec.user_id, target_season);
        season_updates := season_updates + 1;
        
        -- Update weekly leaderboards for all weeks
        FOR week_rec IN 
            SELECT DISTINCT week FROM (
                SELECT week FROM public.picks 
                WHERE user_id = user_rec.user_id 
                  AND season = target_season 
                  AND submitted_at IS NOT NULL
                  AND show_in_combination = true
                
                UNION
                
                SELECT week FROM public.anonymous_picks
                WHERE assigned_user_id = user_rec.user_id 
                  AND season = target_season
                  AND show_on_leaderboard = true
                  AND show_in_combination = true
                  AND validation_status IN ('auto_validated', 'manually_validated')
            ) weeks
            ORDER BY week
        LOOP
            PERFORM public.update_weekly_leaderboard_with_source(
                user_rec.user_id, week_rec.week, target_season
            );
            weekly_updates := weekly_updates + 1;
        END LOOP;
        
        -- Log progress every 10 users
        IF total_users % 10 = 0 THEN
            RAISE NOTICE '📊 Processed % users...', total_users;
        END IF;
    END LOOP;
    
    -- Update rankings
    PERFORM public.update_season_rankings(target_season);
    
    RAISE NOTICE '✅ Leaderboard refresh complete: % users, % season entries, % weekly entries', 
        total_users, season_updates, weekly_updates;
    
    RETURN QUERY SELECT 
        total_users,
        season_updates,
        weekly_updates,
        'SUCCESS: All leaderboards refreshed with combination visibility' as operation_status;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 123 COMPLETED - Leaderboard functions updated for combination visibility!';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 UPDATED FUNCTIONS:';
    RAISE NOTICE '• update_season_leaderboard_with_source() - respects show_in_combination';
    RAISE NOTICE '• update_weekly_leaderboard_with_source() - respects show_in_combination';  
    RAISE NOTICE '• refresh_all_leaderboards() - only processes visible picks';
    RAISE NOTICE '• Uses combination_is_lock override when available';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Leaderboards now respect individual pick visibility settings!';
END;
$$;