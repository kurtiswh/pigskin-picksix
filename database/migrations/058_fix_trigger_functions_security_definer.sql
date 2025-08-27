-- Migration: Fix trigger functions with SECURITY DEFINER and remove display_name dependency
-- Resolves 403 errors when users submit picks due to missing SECURITY DEFINER clause
-- and removes requirement for display_name to allow picks submission to proceed

-- Root cause:
-- 1. Trigger functions from migration 046 are missing SECURITY DEFINER
-- 2. Functions return early if display_name is NULL, blocking pick submission
-- 3. User requested that only user_id should be required for picks logic

-- ===================================================================
-- SOLUTION: Add SECURITY DEFINER and make display_name optional
-- ===================================================================

-- Step 1: Fix update_season_leaderboard_on_pick_change() function
CREATE OR REPLACE FUNCTION public.update_season_leaderboard_on_pick_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- This allows the function to run with elevated privileges
AS $$
DECLARE
    user_display_name TEXT;
    user_stats RECORD;
    existing_entry RECORD;
    new_rank INTEGER;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
BEGIN
    -- Get user display name from users table (with fallback if NULL)
    SELECT display_name INTO user_display_name
    FROM public.users 
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    -- Use fallback display name if NULL (don't block picks submission)
    IF user_display_name IS NULL OR TRIM(user_display_name) = '' THEN
        user_display_name := 'User ' || SUBSTRING(COALESCE(NEW.user_id, OLD.user_id)::TEXT, 1, 8);
    END IF;
    
    -- Calculate aggregated stats for this user/season
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
    WHERE p.user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND p.season = COALESCE(NEW.season, OLD.season);
    
    -- Map payment status with proper CASE statement
    SELECT 
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'  -- Maps 'Unknown', NULL, and any other values to valid status
        END as payment_status,
        CASE 
            WHEN lsp.status = 'Paid' AND COALESCE(lsp.is_matched, FALSE) = TRUE THEN TRUE
            ELSE FALSE
        END as is_verified
    INTO mapped_payment_status, mapped_is_verified
    FROM public.leaguesafe_payments lsp
    WHERE lsp.user_id = COALESCE(NEW.user_id, OLD.user_id) 
        AND lsp.season = COALESCE(NEW.season, OLD.season);
    
    -- If no payment record found, set safe defaults
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
    -- Check if entry exists
    SELECT * INTO existing_entry
    FROM public.season_leaderboard
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND season = COALESCE(NEW.season, OLD.season);
      
    -- Calculate new rank
    SELECT COUNT(*) + 1 INTO new_rank
    FROM public.season_leaderboard sl
    WHERE sl.season = COALESCE(NEW.season, OLD.season)
      AND sl.total_points > user_stats.total_points;
    
    IF existing_entry IS NOT NULL THEN
        -- Update existing entry
        UPDATE public.season_leaderboard 
        SET 
            display_name = user_display_name,
            total_picks = user_stats.total_picks,
            total_wins = user_stats.total_wins,
            total_losses = user_stats.total_losses,
            total_pushes = user_stats.total_pushes,
            lock_wins = user_stats.lock_wins,
            lock_losses = user_stats.lock_losses,
            total_points = user_stats.total_points,
            season_rank = new_rank,
            payment_status = mapped_payment_status,
            is_verified = mapped_is_verified,
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry
        INSERT INTO public.season_leaderboard (
            user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
            lock_wins, lock_losses, total_points, season_rank, payment_status, is_verified
        ) VALUES (
            COALESCE(NEW.user_id, OLD.user_id),
            user_display_name,
            COALESCE(NEW.season, OLD.season),
            user_stats.total_picks,
            user_stats.total_wins,
            user_stats.total_losses,
            user_stats.total_pushes,
            user_stats.lock_wins,
            user_stats.lock_losses,
            user_stats.total_points,
            new_rank,
            mapped_payment_status,
            mapped_is_verified
        );
    END IF;
    
    -- Update ranks for all entries in this season
    WITH ranked_entries AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, total_wins DESC) as new_rank
        FROM public.season_leaderboard
        WHERE season = COALESCE(NEW.season, OLD.season)
    )
    UPDATE public.season_leaderboard sl
    SET season_rank = ranked_entries.new_rank
    FROM ranked_entries
    WHERE sl.id = ranked_entries.id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 2: Fix update_weekly_leaderboard_on_pick_change() function
CREATE OR REPLACE FUNCTION public.update_weekly_leaderboard_on_pick_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- This allows the function to run with elevated privileges
AS $$
DECLARE
    user_display_name TEXT;
    user_stats RECORD;
    existing_entry RECORD;
    new_rank INTEGER;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
BEGIN
    -- Get user display name from users table (with fallback if NULL)
    SELECT display_name INTO user_display_name
    FROM public.users 
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    -- Use fallback display name if NULL (don't block picks submission)
    IF user_display_name IS NULL OR TRIM(user_display_name) = '' THEN
        user_display_name := 'User ' || SUBSTRING(COALESCE(NEW.user_id, OLD.user_id)::TEXT, 1, 8);
    END IF;
    
    -- Calculate aggregated stats for this user/week/season
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
    WHERE p.user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND p.week = COALESCE(NEW.week, OLD.week)
      AND p.season = COALESCE(NEW.season, OLD.season);
    
    -- Map payment status with proper CASE statement
    SELECT 
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'  -- Maps 'Unknown', NULL, and any other values to valid status
        END as payment_status,
        CASE 
            WHEN lsp.status = 'Paid' AND COALESCE(lsp.is_matched, FALSE) = TRUE THEN TRUE
            ELSE FALSE
        END as is_verified
    INTO mapped_payment_status, mapped_is_verified
    FROM public.leaguesafe_payments lsp
    WHERE lsp.user_id = COALESCE(NEW.user_id, OLD.user_id) 
        AND lsp.season = COALESCE(NEW.season, OLD.season);
    
    -- If no payment record found, set safe defaults
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
    -- Check if entry exists
    SELECT * INTO existing_entry
    FROM public.weekly_leaderboard
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND week = COALESCE(NEW.week, OLD.week)
      AND season = COALESCE(NEW.season, OLD.season);
      
    -- Calculate new rank for this week
    SELECT COUNT(*) + 1 INTO new_rank
    FROM public.weekly_leaderboard wl
    WHERE wl.week = COALESCE(NEW.week, OLD.week)
      AND wl.season = COALESCE(NEW.season, OLD.season)
      AND wl.total_points > user_stats.total_points;
    
    IF existing_entry IS NOT NULL THEN
        -- Update existing entry
        UPDATE public.weekly_leaderboard 
        SET 
            display_name = user_display_name,
            picks_made = user_stats.picks_made,
            wins = user_stats.wins,
            losses = user_stats.losses,
            pushes = user_stats.pushes,
            lock_wins = user_stats.lock_wins,
            lock_losses = user_stats.lock_losses,
            total_points = user_stats.total_points,
            weekly_rank = new_rank,
            payment_status = mapped_payment_status,
            is_verified = mapped_is_verified,
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry
        INSERT INTO public.weekly_leaderboard (
            user_id, display_name, week, season, picks_made, wins, losses, pushes,
            lock_wins, lock_losses, total_points, weekly_rank, payment_status, is_verified
        ) VALUES (
            COALESCE(NEW.user_id, OLD.user_id),
            user_display_name,
            COALESCE(NEW.week, OLD.week),
            COALESCE(NEW.season, OLD.season),
            user_stats.picks_made,
            user_stats.wins,
            user_stats.losses,
            user_stats.pushes,
            user_stats.lock_wins,
            user_stats.lock_losses,
            user_stats.total_points,
            new_rank,
            mapped_payment_status,
            mapped_is_verified
        );
    END IF;
    
    -- Update ranks for all entries in this week/season
    WITH ranked_entries AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, wins DESC) as new_rank
        FROM public.weekly_leaderboard
        WHERE week = COALESCE(NEW.week, OLD.week)
          AND season = COALESCE(NEW.season, OLD.season)
    )
    UPDATE public.weekly_leaderboard wl
    SET weekly_rank = ranked_entries.new_rank
    FROM ranked_entries
    WHERE wl.id = ranked_entries.id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 3: Update function comments to reflect the fix
COMMENT ON FUNCTION public.update_season_leaderboard_on_pick_change() IS 
'FIXED: Runs with SECURITY DEFINER and handles missing display_name gracefully. No longer blocks picks submission when display_name is NULL.';

COMMENT ON FUNCTION public.update_weekly_leaderboard_on_pick_change() IS 
'FIXED: Runs with SECURITY DEFINER and handles missing display_name gracefully. No longer blocks picks submission when display_name is NULL.';

-- Step 4: Log successful migration
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 058: Fixed trigger functions with SECURITY DEFINER';
    RAISE NOTICE '✅ Both functions now run with elevated privileges';
    RAISE NOTICE '✅ Display name dependency removed - picks submission no longer blocked';
    RAISE NOTICE '✅ Functions use fallback display name if user display_name is NULL';
    RAISE NOTICE '✅ The 403 error on picks submission should now be resolved';
END $$;