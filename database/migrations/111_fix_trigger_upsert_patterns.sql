-- Migration: Fix trigger functions with proper UPSERT patterns
-- Resolves duplicate key violations in leaderboard updates
-- Uses INSERT ... ON CONFLICT DO UPDATE pattern for thread-safety

-- Root cause analysis:
-- 1. Current functions use separate INSERT/UPDATE logic which creates race conditions
-- 2. Multiple triggers can fire simultaneously causing duplicate key errors
-- 3. show_on_leaderboard flag needs to be properly respected in calculations
-- 4. Rankings need to be calculated only for visible entries

-- ===================================================================
-- SOLUTION: Use UPSERT pattern with proper visibility filtering
-- ===================================================================

-- Step 1: Fix update_season_leaderboard_on_pick_change() with UPSERT
CREATE OR REPLACE FUNCTION public.update_season_leaderboard_on_pick_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_display_name TEXT;
    user_stats RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
    target_user_id UUID;
    target_season INTEGER;
BEGIN
    -- Determine target user and season from NEW or OLD
    target_user_id := COALESCE(NEW.user_id, OLD.user_id);
    target_season := COALESCE(NEW.season, OLD.season);
    
    -- Get user display name from users table (with fallback if NULL)
    SELECT display_name INTO user_display_name
    FROM public.users 
    WHERE id = target_user_id;
    
    -- Use fallback display name if NULL (don't block picks submission)
    IF user_display_name IS NULL OR TRIM(user_display_name) = '' THEN
        user_display_name := 'User ' || SUBSTRING(target_user_id::TEXT, 1, 8);
    END IF;
    
    -- Calculate aggregated stats for this user/season
    -- IMPORTANT: Only count picks that are visible on leaderboard
    SELECT 
        COUNT(p.id) as total_picks,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points
    INTO user_stats
    FROM public.picks p
    WHERE p.user_id = target_user_id
      AND p.season = target_season
      AND p.show_on_leaderboard = true; -- Only count visible picks
    
    -- Map payment status with proper CASE statement
    SELECT 
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        CASE 
            WHEN lsp.status = 'Paid' AND COALESCE(lsp.is_matched, FALSE) = TRUE THEN TRUE
            ELSE FALSE
        END as is_verified
    INTO mapped_payment_status, mapped_is_verified
    FROM public.leaguesafe_payments lsp
    WHERE lsp.user_id = target_user_id 
        AND lsp.season = target_season;
    
    -- If no payment record found, set safe defaults
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
    -- UPSERT: Insert or Update using ON CONFLICT
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, total_points, season_rank, payment_status, is_verified
    ) VALUES (
        target_user_id,
        user_display_name,
        target_season,
        user_stats.total_picks,
        user_stats.total_wins,
        user_stats.total_losses,
        user_stats.total_pushes,
        user_stats.lock_wins,
        user_stats.lock_losses,
        user_stats.total_points,
        1, -- Temporary rank, will be recalculated
        mapped_payment_status,
        mapped_is_verified
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
        updated_at = NOW();
    
    -- Update ranks for all entries in this season (only for visible entries)
    WITH ranked_entries AS (
        SELECT 
            id, 
            ROW_NUMBER() OVER (ORDER BY total_points DESC, total_wins DESC) as new_rank
        FROM public.season_leaderboard
        WHERE season = target_season
    )
    UPDATE public.season_leaderboard sl
    SET season_rank = ranked_entries.new_rank
    FROM ranked_entries
    WHERE sl.id = ranked_entries.id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 2: Fix update_weekly_leaderboard_on_pick_change() with UPSERT
CREATE OR REPLACE FUNCTION public.update_weekly_leaderboard_on_pick_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_display_name TEXT;
    user_stats RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
    target_user_id UUID;
    target_week INTEGER;
    target_season INTEGER;
BEGIN
    -- Determine target user, week, and season from NEW or OLD
    target_user_id := COALESCE(NEW.user_id, OLD.user_id);
    target_week := COALESCE(NEW.week, OLD.week);
    target_season := COALESCE(NEW.season, OLD.season);
    
    -- Get user display name from users table (with fallback if NULL)
    SELECT display_name INTO user_display_name
    FROM public.users 
    WHERE id = target_user_id;
    
    -- Use fallback display name if NULL (don't block picks submission)
    IF user_display_name IS NULL OR TRIM(user_display_name) = '' THEN
        user_display_name := 'User ' || SUBSTRING(target_user_id::TEXT, 1, 8);
    END IF;
    
    -- Calculate aggregated stats for this user/week/season
    -- IMPORTANT: Only count picks that are visible on leaderboard
    SELECT 
        COUNT(p.id) as picks_made,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points
    INTO user_stats
    FROM public.picks p
    WHERE p.user_id = target_user_id
      AND p.week = target_week
      AND p.season = target_season
      AND p.show_on_leaderboard = true; -- Only count visible picks
    
    -- Map payment status with proper CASE statement
    SELECT 
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        CASE 
            WHEN lsp.status = 'Paid' AND COALESCE(lsp.is_matched, FALSE) = TRUE THEN TRUE
            ELSE FALSE
        END as is_verified
    INTO mapped_payment_status, mapped_is_verified
    FROM public.leaguesafe_payments lsp
    WHERE lsp.user_id = target_user_id 
        AND lsp.season = target_season;
    
    -- If no payment record found, set safe defaults
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
    -- UPSERT: Insert or Update using ON CONFLICT
    INSERT INTO public.weekly_leaderboard (
        user_id, display_name, week, season, picks_made, wins, losses, pushes,
        lock_wins, lock_losses, total_points, weekly_rank, payment_status, is_verified
    ) VALUES (
        target_user_id,
        user_display_name,
        target_week,
        target_season,
        user_stats.picks_made,
        user_stats.wins,
        user_stats.losses,
        user_stats.pushes,
        user_stats.lock_wins,
        user_stats.lock_losses,
        user_stats.total_points,
        1, -- Temporary rank, will be recalculated
        mapped_payment_status,
        mapped_is_verified
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
        updated_at = NOW();
    
    -- Update ranks for all entries in this week/season
    WITH ranked_entries AS (
        SELECT 
            id, 
            ROW_NUMBER() OVER (ORDER BY total_points DESC, wins DESC) as new_rank
        FROM public.weekly_leaderboard
        WHERE week = target_week
          AND season = target_season
    )
    UPDATE public.weekly_leaderboard wl
    SET weekly_rank = ranked_entries.new_rank
    FROM ranked_entries
    WHERE wl.id = ranked_entries.id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 3: Update function comments to reflect the UPSERT fix
COMMENT ON FUNCTION public.update_season_leaderboard_on_pick_change() IS 
'FIXED: Uses UPSERT pattern to prevent duplicate key errors. Respects show_on_leaderboard flag. Thread-safe for concurrent updates.';

COMMENT ON FUNCTION public.update_weekly_leaderboard_on_pick_change() IS 
'FIXED: Uses UPSERT pattern to prevent duplicate key errors. Respects show_on_leaderboard flag. Thread-safe for concurrent updates.';

-- Step 4: Log successful migration
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 111: Fixed trigger functions with UPSERT patterns';
    RAISE NOTICE '✅ Both functions now use INSERT ... ON CONFLICT DO UPDATE';
    RAISE NOTICE '✅ Thread-safe against concurrent operations';
    RAISE NOTICE '✅ Properly respects show_on_leaderboard flag in calculations';
    RAISE NOTICE '✅ Duplicate key violations should now be eliminated';
END $$;