-- Migration: Fix the ACTUAL trigger functions causing constraint violations
-- Resolves the real cause: update_season_leaderboard_on_pick_change() and update_weekly_leaderboard_on_pick_change()
-- These are the functions that actually fire when users submit picks, not the ones fixed in migration 045

-- ===================================================================
-- REAL PROBLEM IDENTIFIED:
-- Migration 045 fixed the wrong functions (recalculate_*_leaderboard)
-- The actual triggers use update_*_leaderboard_on_pick_change functions
-- These still contain 'Unknown' default on line 206 of migration 036
-- ===================================================================

-- Step 1: Fix update_season_leaderboard_on_pick_change() function
CREATE OR REPLACE FUNCTION public.update_season_leaderboard_on_pick_change()
RETURNS TRIGGER AS $$
DECLARE
    user_display_name TEXT;
    user_stats RECORD;
    existing_entry RECORD;
    new_rank INTEGER;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
BEGIN
    -- Get user display name from users table
    SELECT display_name INTO user_display_name
    FROM public.users 
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    IF user_display_name IS NULL THEN
        RETURN COALESCE(NEW, OLD);
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
    
    -- **THE FIX**: Properly map payment status with CASE statement like migration 045
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
        -- Update existing entry with mapped payment status
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
            payment_status = mapped_payment_status,  -- Use mapped value
            is_verified = mapped_is_verified,        -- Use mapped value
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry with mapped payment status (NO MORE 'Unknown' DEFAULT!)
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
            mapped_payment_status,  -- Use mapped value instead of 'Unknown'
            mapped_is_verified      -- Use mapped value
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
$$ LANGUAGE plpgsql;

-- Step 2: Fix update_weekly_leaderboard_on_pick_change() function
CREATE OR REPLACE FUNCTION public.update_weekly_leaderboard_on_pick_change()
RETURNS TRIGGER AS $$
DECLARE
    user_display_name TEXT;
    user_stats RECORD;
    existing_entry RECORD;
    new_rank INTEGER;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
BEGIN
    -- Get user display name from users table
    SELECT display_name INTO user_display_name
    FROM public.users 
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    IF user_display_name IS NULL THEN
        RETURN COALESCE(NEW, OLD);
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
    
    -- **THE FIX**: Properly map payment status with CASE statement
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
        -- Update existing entry with mapped payment status
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
            payment_status = mapped_payment_status,  -- Use mapped value
            is_verified = mapped_is_verified,        -- Use mapped value
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry with mapped payment status (NO MORE 'Unknown' DEFAULT!)
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
            mapped_payment_status,  -- Use mapped value instead of 'Unknown'
            mapped_is_verified      -- Use mapped value
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
$$ LANGUAGE plpgsql;

-- Step 3: Clean up any remaining 'Unknown' values that might still exist
UPDATE public.season_leaderboard 
SET 
    payment_status = 'NotPaid',
    is_verified = FALSE,
    updated_at = NOW()
WHERE payment_status NOT IN ('Paid', 'NotPaid', 'Pending');

UPDATE public.weekly_leaderboard 
SET 
    payment_status = 'NotPaid',
    is_verified = FALSE,
    updated_at = NOW()
WHERE payment_status NOT IN ('Paid', 'NotPaid', 'Pending');

-- Step 4: Add documentation
COMMENT ON FUNCTION public.update_season_leaderboard_on_pick_change() IS 'FIXED: Properly maps payment status values to prevent CHECK constraint violations when picks are submitted';
COMMENT ON FUNCTION public.update_weekly_leaderboard_on_pick_change() IS 'FIXED: Properly maps payment status values to prevent CHECK constraint violations when picks are submitted';

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 046: Successfully fixed the ACTUAL trigger functions that fire during pick submission';
    RAISE NOTICE 'The constraint violation error should now be resolved for all users';
    RAISE NOTICE 'Functions fixed: update_season_leaderboard_on_pick_change() and update_weekly_leaderboard_on_pick_change()';
END $$;