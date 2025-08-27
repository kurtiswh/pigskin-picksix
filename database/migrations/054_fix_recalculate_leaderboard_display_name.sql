-- Migration 054: Fix Recalculate Leaderboard Functions Missing Display Name Field
-- Purpose: Fix the root cause of "record \"user_record\" has no field \"display_name\"" error
-- Issue: recalculate_season_leaderboard() and recalculate_weekly_leaderboard() functions 
--        select stats into user_record but don't include display_name field

-- REAL PROBLEM IDENTIFIED:
-- Migration 045 functions select into user_record without including display_name,
-- then try to access user_record.display_name causing the field error.
-- Users DO have display names in the database - the trigger functions just aren't selecting them properly.

-- Step 1: Fix recalculate_season_leaderboard() function
CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard()
RETURNS TRIGGER AS $$
DECLARE
    user_record RECORD;
    existing_entry RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
BEGIN
    -- FIX: Include display_name in the SELECT statement
    SELECT 
        u.display_name,  -- This was missing!
        COUNT(p.id) as total_picks,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points
    INTO user_record
    FROM public.picks p 
    JOIN public.users u ON u.id = p.user_id  -- Join to get display_name
    WHERE p.user_id = COALESCE(NEW.user_id, OLD.user_id) 
        AND p.season = COALESCE(NEW.season, OLD.season)
    GROUP BY u.display_name;
    
    -- If no picks found, get display name separately
    IF user_record.display_name IS NULL THEN
        SELECT display_name INTO user_record.display_name
        FROM public.users
        WHERE id = COALESCE(NEW.user_id, OLD.user_id);
        
        -- If still no display name, return early
        IF user_record.display_name IS NULL THEN
            RETURN COALESCE(NEW, OLD);
        END IF;
        
        -- Set default stats for users with no picks yet
        user_record.total_picks := 0;
        user_record.total_wins := 0;
        user_record.total_losses := 0;
        user_record.total_pushes := 0;
        user_record.lock_wins := 0;
        user_record.lock_losses := 0;
        user_record.total_points := 0;
    END IF;
    
    -- Map payment status to allowed values with proper constraint handling
    SELECT 
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'  -- Handles 'Unknown', NULL, and any other values
        END as payment_status,
        CASE 
            WHEN lsp.status = 'Paid' AND COALESCE(lsp.is_matched, FALSE) = TRUE THEN TRUE
            ELSE FALSE
        END as is_verified
    INTO mapped_payment_status, mapped_is_verified
    FROM public.leaguesafe_payments lsp 
    WHERE lsp.user_id = COALESCE(NEW.user_id, OLD.user_id) 
        AND lsp.season = COALESCE(NEW.season, OLD.season);
    
    -- If no payment record found, set defaults
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
    -- Check if season leaderboard entry exists
    SELECT * INTO existing_entry
    FROM public.season_leaderboard 
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
        AND season = COALESCE(NEW.season, OLD.season);
    
    IF existing_entry IS NOT NULL THEN
        -- Update existing entry
        UPDATE public.season_leaderboard 
        SET 
            display_name = user_record.display_name,  -- Now this field exists!
            total_picks = user_record.total_picks,
            total_wins = user_record.total_wins,
            total_losses = user_record.total_losses,
            total_pushes = user_record.total_pushes,
            lock_wins = user_record.lock_wins,
            lock_losses = user_record.lock_losses,
            total_points = user_record.total_points,
            payment_status = mapped_payment_status,
            is_verified = mapped_is_verified,
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry with properly mapped payment status
        INSERT INTO public.season_leaderboard (
            user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
            lock_wins, lock_losses, total_points, payment_status, is_verified
        ) VALUES (
            COALESCE(NEW.user_id, OLD.user_id),
            user_record.display_name,  -- Now this field exists!
            COALESCE(NEW.season, OLD.season),
            user_record.total_picks,
            user_record.total_wins,
            user_record.total_losses,
            user_record.total_pushes,
            user_record.lock_wins,
            user_record.lock_losses,
            user_record.total_points,
            mapped_payment_status,  -- Use mapped value instead of raw status
            mapped_is_verified      -- Use mapped value instead of raw status
        );
    END IF;
    
    -- Recalculate rankings for this season
    UPDATE public.season_leaderboard 
    SET season_rank = subq.rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, total_wins DESC) as rank
        FROM public.season_leaderboard
        WHERE season = COALESCE(NEW.season, OLD.season)
    ) subq
    WHERE season_leaderboard.id = subq.id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 2: Fix recalculate_weekly_leaderboard() function
CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard()
RETURNS TRIGGER AS $$
DECLARE
    user_record RECORD;
    existing_entry RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
BEGIN
    -- FIX: Include display_name in the SELECT statement
    SELECT 
        u.display_name,  -- This was missing!
        COUNT(p.id) as picks_made,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points
    INTO user_record
    FROM public.picks p 
    JOIN public.users u ON u.id = p.user_id  -- Join to get display_name
    WHERE p.user_id = COALESCE(NEW.user_id, OLD.user_id) 
        AND p.week = COALESCE(NEW.week, OLD.week)
        AND p.season = COALESCE(NEW.season, OLD.season)
    GROUP BY u.display_name;
    
    -- If no picks found, get display name separately
    IF user_record.display_name IS NULL THEN
        SELECT display_name INTO user_record.display_name
        FROM public.users
        WHERE id = COALESCE(NEW.user_id, OLD.user_id);
        
        -- If still no display name, return early
        IF user_record.display_name IS NULL THEN
            RETURN COALESCE(NEW, OLD);
        END IF;
        
        -- Set default stats for users with no picks yet
        user_record.picks_made := 0;
        user_record.wins := 0;
        user_record.losses := 0;
        user_record.pushes := 0;
        user_record.lock_wins := 0;
        user_record.lock_losses := 0;
        user_record.total_points := 0;
    END IF;
    
    -- Map payment status to allowed values
    SELECT 
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'  -- Handles 'Unknown', NULL, and any other values
        END as payment_status,
        CASE 
            WHEN lsp.status = 'Paid' AND COALESCE(lsp.is_matched, FALSE) = TRUE THEN TRUE
            ELSE FALSE
        END as is_verified
    INTO mapped_payment_status, mapped_is_verified
    FROM public.leaguesafe_payments lsp 
    WHERE lsp.user_id = COALESCE(NEW.user_id, OLD.user_id) 
        AND lsp.season = COALESCE(NEW.season, OLD.season);
    
    -- If no payment record found, set defaults
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
    -- Check if weekly leaderboard entry exists
    SELECT * INTO existing_entry
    FROM public.weekly_leaderboard 
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
        AND week = COALESCE(NEW.week, OLD.week)
        AND season = COALESCE(NEW.season, OLD.season);
    
    IF existing_entry IS NOT NULL THEN
        -- Update existing entry
        UPDATE public.weekly_leaderboard 
        SET 
            display_name = user_record.display_name,  -- Now this field exists!
            picks_made = user_record.picks_made,
            wins = user_record.wins,
            losses = user_record.losses,
            pushes = user_record.pushes,
            lock_wins = user_record.lock_wins,
            lock_losses = user_record.lock_losses,
            total_points = user_record.total_points,
            payment_status = mapped_payment_status,
            is_verified = mapped_is_verified,
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry with properly mapped payment status
        INSERT INTO public.weekly_leaderboard (
            user_id, display_name, week, season, picks_made, wins, losses, pushes,
            lock_wins, lock_losses, total_points, payment_status, is_verified
        ) VALUES (
            COALESCE(NEW.user_id, OLD.user_id),
            user_record.display_name,  -- Now this field exists!
            COALESCE(NEW.week, OLD.week),
            COALESCE(NEW.season, OLD.season),
            user_record.picks_made,
            user_record.wins,
            user_record.losses,
            user_record.pushes,
            user_record.lock_wins,
            user_record.lock_losses,
            user_record.total_points,
            mapped_payment_status,  -- Use mapped value instead of raw status
            mapped_is_verified      -- Use mapped value instead of raw status
        );
    END IF;
    
    -- Recalculate rankings for this week/season
    UPDATE public.weekly_leaderboard 
    SET weekly_rank = subq.rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, wins DESC) as rank
        FROM public.weekly_leaderboard
        WHERE week = COALESCE(NEW.week, OLD.week)
            AND season = COALESCE(NEW.season, OLD.season)
    ) subq
    WHERE weekly_leaderboard.id = subq.id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 3: Fix helper function recalculate_season_leaderboard_for_user()
CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard_for_user(
    p_user_id UUID, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_display_name TEXT;
    user_stats RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
    existing_entry RECORD;
BEGIN
    -- Get display name first
    SELECT display_name INTO user_display_name
    FROM public.users
    WHERE id = p_user_id;
    
    IF user_display_name IS NULL THEN
        RETURN;
    END IF;
    
    -- Calculate stats for this user/season
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
    WHERE p.user_id = p_user_id 
        AND p.season = p_season;
    
    -- Map payment status
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
    WHERE lsp.user_id = p_user_id 
        AND lsp.season = p_season;
    
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
    -- Upsert the leaderboard entry
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified
    ) VALUES (
        p_user_id,
        user_display_name,
        p_season,
        user_stats.total_picks,
        user_stats.total_wins,
        user_stats.total_losses,
        user_stats.total_pushes,
        user_stats.lock_wins,
        user_stats.lock_losses,
        user_stats.total_points,
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
        
    -- Recalculate rankings
    UPDATE public.season_leaderboard 
    SET season_rank = subq.rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, total_wins DESC) as rank
        FROM public.season_leaderboard
        WHERE season = p_season
    ) subq
    WHERE season_leaderboard.id = subq.id;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Fix helper function recalculate_weekly_leaderboard_for_user()
CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard_for_user(
    p_user_id UUID, 
    p_week INTEGER, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_display_name TEXT;
    user_stats RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
    existing_entry RECORD;
BEGIN
    -- Get display name first
    SELECT display_name INTO user_display_name
    FROM public.users
    WHERE id = p_user_id;
    
    IF user_display_name IS NULL THEN
        RETURN;
    END IF;
    
    -- Calculate stats for this user/week/season
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
    WHERE p.user_id = p_user_id 
        AND p.week = p_week
        AND p.season = p_season;
    
    -- Map payment status
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
    WHERE lsp.user_id = p_user_id 
        AND lsp.season = p_season;
    
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
    -- Upsert the leaderboard entry
    INSERT INTO public.weekly_leaderboard (
        user_id, display_name, week, season, picks_made, wins, losses, pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified
    ) VALUES (
        p_user_id,
        user_display_name,
        p_week,
        p_season,
        user_stats.picks_made,
        user_stats.wins,
        user_stats.losses,
        user_stats.pushes,
        user_stats.lock_wins,
        user_stats.lock_losses,
        user_stats.total_points,
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
        
    -- Recalculate rankings
    UPDATE public.weekly_leaderboard 
    SET weekly_rank = subq.rank
    FROM (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, wins DESC) as rank
        FROM public.weekly_leaderboard
        WHERE week = p_week AND season = p_season
    ) subq
    WHERE weekly_leaderboard.id = subq.id;
END;
$$ LANGUAGE plpgsql;

-- Add documentation
COMMENT ON FUNCTION public.recalculate_season_leaderboard() IS 'FIXED: Now properly includes display_name when selecting into user_record to prevent field access errors';
COMMENT ON FUNCTION public.recalculate_weekly_leaderboard() IS 'FIXED: Now properly includes display_name when selecting into user_record to prevent field access errors';
COMMENT ON FUNCTION public.recalculate_season_leaderboard_for_user IS 'FIXED: Now properly gets display_name from users table before using it';
COMMENT ON FUNCTION public.recalculate_weekly_leaderboard_for_user IS 'FIXED: Now properly gets display_name from users table before using it';

-- Migration success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 054 completed successfully!';
    RAISE NOTICE '✅ Fixed recalculate_*_leaderboard functions to include display_name field';
    RAISE NOTICE '✅ Pick submissions should now work without ""record has no field display_name"" errors';
    RAISE NOTICE '✅ All trigger functions now properly access user display names from the database';
END $$;