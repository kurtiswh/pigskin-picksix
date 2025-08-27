-- Migration 047: Fix RLS policy violations during anonymous picks assignment
-- 
-- PROBLEM: Anonymous picks assignment causes flashing page due to RLS violations
-- The trigger functions that update leaderboards run with anonymous user permissions
-- but the RLS policies only allow service_role to write to leaderboard tables
--
-- SOLUTION: Add SECURITY DEFINER to trigger functions so they run with elevated
-- permissions and can bypass RLS policies when updating leaderboards

-- Fix update_season_leaderboard_on_pick_change to run with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.update_season_leaderboard_on_pick_change()
RETURNS TRIGGER
SECURITY DEFINER  -- This allows the function to bypass RLS policies
LANGUAGE plpgsql AS $$
DECLARE
    user_week_picks INTEGER;
    user_wins INTEGER;
    user_losses INTEGER;
    user_pushes INTEGER;
    user_lock_wins INTEGER;
    user_lock_losses INTEGER;
    user_total_points INTEGER;
    user_display_name TEXT;
    user_payment_status TEXT;
    user_is_verified BOOLEAN;
    current_season INTEGER;
BEGIN
    -- Determine the season from the NEW or OLD record
    current_season := COALESCE(NEW.season, OLD.season);

    -- Get user info (display name and payment status)
    SELECT 
        u.display_name,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'  -- Maps 'Unknown', NULL, and any other values to valid status
        END as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified
    INTO user_display_name, user_payment_status, user_is_verified
    FROM users u
    LEFT JOIN leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = current_season
    WHERE u.id = COALESCE(NEW.user_id, OLD.user_id);

    -- Calculate season totals for this user
    SELECT 
        COUNT(*) as total_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock = true THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock = true THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_week_picks, user_wins, user_losses, user_pushes, user_lock_wins, user_lock_losses, user_total_points
    FROM picks
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) 
      AND season = current_season
      AND result IS NOT NULL;

    -- Insert or update the season leaderboard entry
    INSERT INTO season_leaderboard (
        user_id, 
        display_name, 
        season, 
        total_picks, 
        total_wins, 
        total_losses, 
        total_pushes,
        lock_wins,
        lock_losses,
        total_points, 
        payment_status,
        is_verified
    ) VALUES (
        COALESCE(NEW.user_id, OLD.user_id), 
        user_display_name, 
        current_season, 
        user_week_picks, 
        user_wins, 
        user_losses, 
        user_pushes,
        user_lock_wins,
        user_lock_losses,
        user_total_points, 
        user_payment_status,
        user_is_verified
    )
    ON CONFLICT (user_id, season)
    DO UPDATE SET
        display_name = EXCLUDED.display_name,
        total_picks = EXCLUDED.total_picks,
        total_wins = EXCLUDED.total_wins,
        total_losses = EXCLUDED.total_losses,
        total_pushes = EXCLUDED.total_pushes,
        lock_wins = EXCLUDED.lock_wins,
        lock_losses = EXCLUDED.lock_losses,
        total_points = EXCLUDED.total_points,
        payment_status = EXCLUDED.payment_status,
        is_verified = EXCLUDED.is_verified;

    RETURN NULL;
END;
$$;

-- Fix update_weekly_leaderboard_on_pick_change to run with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.update_weekly_leaderboard_on_pick_change()
RETURNS TRIGGER
SECURITY DEFINER  -- This allows the function to bypass RLS policies
LANGUAGE plpgsql AS $$
DECLARE
    user_week_picks INTEGER;
    user_wins INTEGER;
    user_losses INTEGER;
    user_pushes INTEGER;
    user_lock_wins INTEGER;
    user_lock_losses INTEGER;
    user_total_points INTEGER;
    user_display_name TEXT;
    user_payment_status TEXT;
    user_is_verified BOOLEAN;
    target_week INTEGER;
    current_season INTEGER;
BEGIN
    -- Determine the week and season from the NEW or OLD record
    target_week := COALESCE(NEW.week, OLD.week);
    current_season := COALESCE(NEW.season, OLD.season);

    -- Get user info (display name and payment status)
    SELECT 
        u.display_name,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'  -- Maps 'Unknown', NULL, and any other values to valid status
        END as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified
    INTO user_display_name, user_payment_status, user_is_verified
    FROM users u
    LEFT JOIN leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = current_season
    WHERE u.id = COALESCE(NEW.user_id, OLD.user_id);

    -- Calculate weekly totals for this user and week
    SELECT 
        COUNT(*) as total_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock = true THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock = true THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_week_picks, user_wins, user_losses, user_pushes, user_lock_wins, user_lock_losses, user_total_points
    FROM picks
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) 
      AND week = target_week 
      AND season = current_season
      AND result IS NOT NULL;

    -- Insert or update the weekly leaderboard entry
    INSERT INTO weekly_leaderboard (
        user_id, 
        display_name, 
        week, 
        season, 
        picks_made, 
        wins, 
        losses, 
        pushes,
        lock_wins,
        lock_losses,
        total_points, 
        payment_status,
        is_verified
    ) VALUES (
        COALESCE(NEW.user_id, OLD.user_id), 
        user_display_name, 
        target_week, 
        current_season, 
        user_week_picks, 
        user_wins, 
        user_losses, 
        user_pushes,
        user_lock_wins,
        user_lock_losses,
        user_total_points, 
        user_payment_status,
        user_is_verified
    )
    ON CONFLICT (user_id, week, season)
    DO UPDATE SET
        display_name = EXCLUDED.display_name,
        picks_made = EXCLUDED.picks_made,
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        pushes = EXCLUDED.pushes,
        lock_wins = EXCLUDED.lock_wins,
        lock_losses = EXCLUDED.lock_losses,
        total_points = EXCLUDED.total_points,
        payment_status = EXCLUDED.payment_status,
        is_verified = EXCLUDED.is_verified;

    RETURN NULL;
END;
$$;

-- Comment explaining the fix
COMMENT ON FUNCTION public.update_season_leaderboard_on_pick_change() IS 'Trigger function with SECURITY DEFINER to bypass RLS policies when updating leaderboards during anonymous picks assignment';
COMMENT ON FUNCTION public.update_weekly_leaderboard_on_pick_change() IS 'Trigger function with SECURITY DEFINER to bypass RLS policies when updating leaderboards during anonymous picks assignment';