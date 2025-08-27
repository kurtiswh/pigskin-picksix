-- ===================================================================
-- Migration 052: Fix Leaderboard Ranking Calculations
-- ===================================================================
-- 
-- PROBLEM: Users with anonymous picks show NULL rankings on leaderboards
-- CAUSE: Migration 050 functions missing ranking calculations after upserts
-- SOLUTION: Add ranking updates to both season and weekly leaderboard functions
--
-- This migration fixes:
-- 1. NULL season_rank for users with anonymous picks
-- 2. NULL weekly_rank for users with anonymous picks  
-- 3. Ensures proper ranking calculations in all leaderboard update functions
-- ===================================================================

-- Fix update_season_leaderboard_with_source() - Add ranking calculations
CREATE OR REPLACE FUNCTION public.update_season_leaderboard_with_source(
    target_user_id UUID,
    target_season INTEGER,
    source_type VARCHAR(20)
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_stats RECORD;
    anonymous_stats RECORD;
    user_info RECORD;
    has_authenticated_picks BOOLEAN DEFAULT FALSE;
    has_anonymous_picks BOOLEAN DEFAULT FALSE;
    final_pick_source VARCHAR(20);
BEGIN
    -- Get user info (display name and payment status)
    SELECT 
        u.display_name,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'  -- Maps 'Unknown', NULL, and any other values to valid status
        END as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified
    INTO user_info
    FROM public.users u
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = target_season
    WHERE u.id = target_user_id;
    
    -- Calculate stats from authenticated picks
    SELECT 
        COUNT(*) as total_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock = true THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock = true THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_stats
    FROM public.picks 
    WHERE user_id = target_user_id 
        AND season = target_season 
        AND result IS NOT NULL;
    
    -- Check if user has authenticated picks
    has_authenticated_picks := COALESCE(user_stats.total_picks, 0) > 0;
    
    -- Calculate stats from anonymous picks 
    SELECT 
        COUNT(*) as anon_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as anon_wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as anon_losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock = true THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock = true THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(points_earned), 0) as anon_points
    INTO anonymous_stats
    FROM public.anonymous_picks ap
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = true
        AND ap.result IS NOT NULL;
    
    -- Check if user has anonymous picks
    has_anonymous_picks := COALESCE(anonymous_stats.anon_picks, 0) > 0;
    
    -- Determine pick source
    final_pick_source := CASE 
        WHEN has_authenticated_picks AND has_anonymous_picks THEN 'mixed'
        WHEN has_anonymous_picks THEN 'anonymous'
        ELSE 'authenticated'
    END;
    
    -- Combine stats
    user_stats.total_picks := COALESCE(user_stats.total_picks, 0) + COALESCE(anonymous_stats.anon_picks, 0);
    user_stats.wins := COALESCE(user_stats.wins, 0) + COALESCE(anonymous_stats.anon_wins, 0);
    user_stats.losses := COALESCE(user_stats.losses, 0) + COALESCE(anonymous_stats.anon_losses, 0);
    user_stats.pushes := COALESCE(user_stats.pushes, 0) + COALESCE(anonymous_stats.anon_pushes, 0);
    user_stats.lock_wins := COALESCE(user_stats.lock_wins, 0) + COALESCE(anonymous_stats.anon_lock_wins, 0);
    user_stats.lock_losses := COALESCE(user_stats.lock_losses, 0) + COALESCE(anonymous_stats.anon_lock_losses, 0);
    user_stats.total_points := COALESCE(user_stats.total_points, 0) + COALESCE(anonymous_stats.anon_points, 0);
    
    -- Insert or update season leaderboard with enhanced source information
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
    ) VALUES (
        target_user_id, user_info.display_name, target_season, user_stats.total_picks,
        user_stats.wins, user_stats.losses, user_stats.pushes, user_stats.lock_wins,
        user_stats.lock_losses, user_stats.total_points, user_info.payment_status,
        user_info.is_verified, final_pick_source
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
        is_verified = EXCLUDED.is_verified,
        pick_source = EXCLUDED.pick_source;
        
    -- *** FIX: Add ranking calculations that were missing ***
    -- Update ranks for all entries in this season
    WITH ranked_entries AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, total_wins DESC) as new_rank
        FROM public.season_leaderboard
        WHERE season = target_season
    )
    UPDATE public.season_leaderboard sl
    SET season_rank = ranked_entries.new_rank
    FROM ranked_entries
    WHERE sl.id = ranked_entries.id;
END;
$$;

-- Fix update_weekly_leaderboard_with_source() - Add ranking calculations
CREATE OR REPLACE FUNCTION public.update_weekly_leaderboard_with_source(
    target_user_id UUID,
    target_week INTEGER,
    target_season INTEGER,
    source_type VARCHAR(20)
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_stats RECORD;
    anonymous_stats RECORD;
    user_info RECORD;
    has_authenticated_picks BOOLEAN DEFAULT FALSE;
    has_anonymous_picks BOOLEAN DEFAULT FALSE;
    final_pick_source VARCHAR(20);
BEGIN
    -- Get user info (display name and payment status)
    SELECT 
        u.display_name,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'  -- Maps 'Unknown', NULL, and any other values to valid status
        END as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified
    INTO user_info
    FROM public.users u
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = target_season
    WHERE u.id = target_user_id;
    
    -- Calculate stats from authenticated picks
    SELECT 
        COUNT(*) as total_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock = true THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock = true THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_stats
    FROM public.picks 
    WHERE user_id = target_user_id 
        AND week = target_week
        AND season = target_season 
        AND result IS NOT NULL;
    
    -- Check if user has authenticated picks for this week
    has_authenticated_picks := COALESCE(user_stats.total_picks, 0) > 0;
    
    -- Calculate stats from anonymous picks for this specific week
    SELECT 
        COUNT(*) as anon_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as anon_wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as anon_losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock = true THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock = true THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(points_earned), 0) as anon_points
    INTO anonymous_stats
    FROM public.anonymous_picks ap
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.week = target_week
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = true
        AND ap.result IS NOT NULL;
    
    -- Check if user has anonymous picks for this week
    has_anonymous_picks := COALESCE(anonymous_stats.anon_picks, 0) > 0;
    
    -- Determine pick source
    final_pick_source := CASE 
        WHEN has_authenticated_picks AND has_anonymous_picks THEN 'mixed'
        WHEN has_anonymous_picks THEN 'anonymous'
        ELSE 'authenticated'
    END;
    
    -- Combine stats
    user_stats.total_picks := COALESCE(user_stats.total_picks, 0) + COALESCE(anonymous_stats.anon_picks, 0);
    user_stats.wins := COALESCE(user_stats.wins, 0) + COALESCE(anonymous_stats.anon_wins, 0);
    user_stats.losses := COALESCE(user_stats.losses, 0) + COALESCE(anonymous_stats.anon_losses, 0);
    user_stats.pushes := COALESCE(user_stats.pushes, 0) + COALESCE(anonymous_stats.anon_pushes, 0);
    user_stats.lock_wins := COALESCE(user_stats.lock_wins, 0) + COALESCE(anonymous_stats.anon_lock_wins, 0);
    user_stats.lock_losses := COALESCE(user_stats.lock_losses, 0) + COALESCE(anonymous_stats.anon_lock_losses, 0);
    user_stats.total_points := COALESCE(user_stats.total_points, 0) + COALESCE(anonymous_stats.anon_points, 0);
    
    -- Insert or update weekly leaderboard with enhanced source information
    INSERT INTO public.weekly_leaderboard (
        user_id, display_name, week, season, picks_made, wins, losses, pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
    ) VALUES (
        target_user_id, user_info.display_name, target_week, target_season, user_stats.total_picks,
        user_stats.wins, user_stats.losses, user_stats.pushes, user_stats.lock_wins,
        user_stats.lock_losses, user_stats.total_points, user_info.payment_status,
        user_info.is_verified, final_pick_source
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
        is_verified = EXCLUDED.is_verified,
        pick_source = EXCLUDED.pick_source;
        
    -- *** FIX: Add ranking calculations that were missing ***
    -- Update ranks for all entries in this week/season
    WITH ranked_entries AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, wins DESC) as new_rank
        FROM public.weekly_leaderboard
        WHERE week = target_week
          AND season = target_season
    )
    UPDATE public.weekly_leaderboard wl
    SET weekly_rank = ranked_entries.new_rank
    FROM ranked_entries
    WHERE wl.id = ranked_entries.id;
END;
$$;

-- Recalculate rankings for existing entries to fix NULL ranks
DO $$
DECLARE
    season_record RECORD;
    week_record RECORD;
BEGIN
    -- Fix season rankings for 2025
    RAISE NOTICE 'Recalculating season rankings for 2025...';
    WITH ranked_entries AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, total_wins DESC) as new_rank
        FROM public.season_leaderboard
        WHERE season = 2025
    )
    UPDATE public.season_leaderboard sl
    SET season_rank = ranked_entries.new_rank
    FROM ranked_entries
    WHERE sl.id = ranked_entries.id;
    
    -- Fix weekly rankings for 2025 (all weeks)
    RAISE NOTICE 'Recalculating weekly rankings for 2025...';
    FOR week_record IN 
        SELECT DISTINCT week FROM public.weekly_leaderboard WHERE season = 2025 
    LOOP
        WITH ranked_entries AS (
            SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, wins DESC) as new_rank
            FROM public.weekly_leaderboard
            WHERE week = week_record.week AND season = 2025
        )
        UPDATE public.weekly_leaderboard wl
        SET weekly_rank = ranked_entries.new_rank
        FROM ranked_entries
        WHERE wl.id = ranked_entries.id;
        
        RAISE NOTICE 'Updated rankings for Week % (% entries)', week_record.week, 
            (SELECT COUNT(*) FROM public.weekly_leaderboard WHERE week = week_record.week AND season = 2025);
    END LOOP;
    
    RAISE NOTICE 'Ranking fix completed successfully!';
END;
$$;

-- Add documentation
COMMENT ON FUNCTION public.update_season_leaderboard_with_source(UUID, INTEGER, VARCHAR) IS 
'FIXED: Now includes proper ranking calculations to prevent NULL season_rank values for anonymous pick users';

COMMENT ON FUNCTION public.update_weekly_leaderboard_with_source(UUID, INTEGER, INTEGER, VARCHAR) IS 
'FIXED: Now includes proper ranking calculations to prevent NULL weekly_rank values for anonymous pick users';

-- Migration summary
SELECT 'Migration 052 completed: Fixed ranking calculations for leaderboard functions' as status;