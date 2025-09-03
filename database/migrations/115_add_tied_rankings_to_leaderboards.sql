-- Migration: Add tied rankings to leaderboards
-- When users have the same points, they should have the same rank

-- ===================================================================
-- Fix Season Leaderboard Trigger to Support Tied Rankings
-- ===================================================================

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
    
    -- Update ranks for all entries in this season
    -- CHANGED: Use RANK() instead of ROW_NUMBER() to support ties
    WITH ranked_entries AS (
        SELECT 
            id, 
            RANK() OVER (ORDER BY total_points DESC, total_wins DESC) as new_rank
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

-- ===================================================================
-- Fix Weekly Leaderboard Trigger to Support Tied Rankings
-- ===================================================================

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
    -- CHANGED: Use RANK() instead of ROW_NUMBER() to support ties
    WITH ranked_entries AS (
        SELECT 
            id, 
            RANK() OVER (ORDER BY total_points DESC, wins DESC) as new_rank
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

-- ===================================================================
-- Update Manual Rebuild Functions to Use Tied Rankings
-- ===================================================================

-- Update rebuild_season_leaderboard to use RANK()
CREATE OR REPLACE FUNCTION public.rebuild_season_leaderboard(
    target_season INTEGER DEFAULT NULL,
    target_user_id UUID DEFAULT NULL,
    force_rebuild BOOLEAN DEFAULT false
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    admin_user RECORD;
    users_processed INTEGER := 0;
    entries_created INTEGER := 0;
    entries_updated INTEGER := 0;
    errors_encountered INTEGER := 0;
    error_log TEXT := '';
    user_rec RECORD;
    user_stats RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
    season_filter TEXT;
BEGIN
    -- Admin check
    SELECT u.id, u.email, u.is_admin 
    INTO admin_user
    FROM public.users u 
    WHERE u.email = auth.email() AND u.is_admin = true;
    
    IF admin_user IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Admin privileges required'
        );
    END IF;
    
    -- Determine season filter
    IF target_season IS NOT NULL THEN
        season_filter := 'season ' || target_season;
    ELSE
        season_filter := 'all seasons';
    END IF;
    
    -- Clear existing entries if force rebuild
    IF force_rebuild THEN
        IF target_user_id IS NOT NULL AND target_season IS NOT NULL THEN
            DELETE FROM public.season_leaderboard 
            WHERE user_id = target_user_id AND season = target_season;
        ELSIF target_season IS NOT NULL THEN
            DELETE FROM public.season_leaderboard 
            WHERE season = target_season;
        ELSIF target_user_id IS NOT NULL THEN
            DELETE FROM public.season_leaderboard 
            WHERE user_id = target_user_id;
        ELSE
            DELETE FROM public.season_leaderboard;
        END IF;
    END IF;
    
    -- Process each user with picks in the target season(s)
    FOR user_rec IN 
        SELECT DISTINCT p.user_id, p.season, u.display_name
        FROM public.picks p
        JOIN public.users u ON u.id = p.user_id
        WHERE (target_season IS NULL OR p.season = target_season)
          AND (target_user_id IS NULL OR p.user_id = target_user_id)
          AND p.show_on_leaderboard = true
    LOOP
        BEGIN
            users_processed := users_processed + 1;
            
            -- Calculate stats for this user/season (only visible picks)
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
            WHERE p.user_id = user_rec.user_id
              AND p.season = user_rec.season
              AND p.show_on_leaderboard = true;
            
            -- Get payment status
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
            WHERE lsp.user_id = user_rec.user_id 
                AND lsp.season = user_rec.season;
            
            -- Set defaults if no payment record
            IF mapped_payment_status IS NULL THEN
                mapped_payment_status := 'NotPaid';
                mapped_is_verified := FALSE;
            END IF;
            
            -- UPSERT the leaderboard entry
            INSERT INTO public.season_leaderboard (
                user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
                lock_wins, lock_losses, total_points, season_rank, payment_status, is_verified
            ) VALUES (
                user_rec.user_id,
                COALESCE(user_rec.display_name, 'User ' || SUBSTRING(user_rec.user_id::TEXT, 1, 8)),
                user_rec.season,
                user_stats.total_picks,
                user_stats.total_wins,
                user_stats.total_losses,
                user_stats.total_pushes,
                user_stats.lock_wins,
                user_stats.lock_losses,
                user_stats.total_points,
                1, -- Temporary rank
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
                
            -- Track if this was insert or update
            GET DIAGNOSTICS entries_created = ROW_COUNT;
            IF entries_created = 1 THEN
                entries_created := entries_created + 1;
            ELSE
                entries_updated := entries_updated + 1;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            errors_encountered := errors_encountered + 1;
            error_log := error_log || 'User ' || user_rec.user_id || ' season ' || user_rec.season || ': ' || SQLERRM || '; ';
        END;
    END LOOP;
    
    -- Update all ranks for affected seasons using RANK() for ties
    FOR user_rec IN 
        SELECT DISTINCT season 
        FROM public.season_leaderboard 
        WHERE (target_season IS NULL OR season = target_season)
    LOOP
        BEGIN
            WITH ranked_entries AS (
                SELECT 
                    id, 
                    RANK() OVER (ORDER BY total_points DESC, total_wins DESC) as new_rank
                FROM public.season_leaderboard
                WHERE season = user_rec.season
            )
            UPDATE public.season_leaderboard sl
            SET season_rank = ranked_entries.new_rank
            FROM ranked_entries
            WHERE sl.id = ranked_entries.id;
            
        EXCEPTION WHEN OTHERS THEN
            error_log := error_log || 'Rank update for season ' || user_rec.season || ': ' || SQLERRM || '; ';
        END;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'operation', 'Season leaderboard rebuild',
        'scope', season_filter,
        'users_processed', users_processed,
        'entries_created', entries_created,
        'entries_updated', entries_updated,
        'errors_encountered', errors_encountered,
        'error_log', NULLIF(error_log, ''),
        'admin_user', admin_user.email
    );
END;
$$;

-- Quick function to recalculate all ranks with ties
CREATE OR REPLACE FUNCTION public.recalculate_all_ranks_with_ties()
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    season_count INTEGER := 0;
    week_count INTEGER := 0;
BEGIN
    -- Recalculate season leaderboard ranks
    FOR season_count IN 
        SELECT COUNT(DISTINCT season) FROM public.season_leaderboard
    LOOP
        WITH ranked_entries AS (
            SELECT 
                id, 
                season,
                RANK() OVER (PARTITION BY season ORDER BY total_points DESC, total_wins DESC) as new_rank
            FROM public.season_leaderboard
        )
        UPDATE public.season_leaderboard sl
        SET season_rank = ranked_entries.new_rank
        FROM ranked_entries
        WHERE sl.id = ranked_entries.id;
    END LOOP;
    
    -- Recalculate weekly leaderboard ranks
    FOR week_count IN 
        SELECT COUNT(DISTINCT CONCAT(season, '-', week)) FROM public.weekly_leaderboard
    LOOP
        WITH ranked_entries AS (
            SELECT 
                id,
                season,
                week,
                RANK() OVER (PARTITION BY season, week ORDER BY total_points DESC, wins DESC) as new_rank
            FROM public.weekly_leaderboard
        )
        UPDATE public.weekly_leaderboard wl
        SET weekly_rank = ranked_entries.new_rank
        FROM ranked_entries
        WHERE wl.id = ranked_entries.id;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'All rankings recalculated with tie support',
        'seasons_processed', season_count,
        'weeks_processed', week_count
    );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.recalculate_all_ranks_with_ties() TO authenticated;

-- Update function comments
COMMENT ON FUNCTION public.update_season_leaderboard_on_pick_change() IS 
'UPDATED: Uses RANK() instead of ROW_NUMBER() to support tied rankings. Thread-safe with UPSERT pattern.';

COMMENT ON FUNCTION public.update_weekly_leaderboard_on_pick_change() IS 
'UPDATED: Uses RANK() instead of ROW_NUMBER() to support tied rankings. Thread-safe with UPSERT pattern.';

COMMENT ON FUNCTION public.recalculate_all_ranks_with_ties() IS 
'Recalculates all leaderboard rankings using RANK() to properly handle ties.';

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 115: Added tied rankings support to leaderboards';
    RAISE NOTICE '✅ Changed from ROW_NUMBER() to RANK() for ranking calculation';
    RAISE NOTICE '✅ Users with same points will now show the same rank';
    RAISE NOTICE '✅ Example: Two users with 100 points will both be rank 1';
    RAISE NOTICE '✅ The next user would be rank 3 (not 2)';
    RAISE NOTICE '';
    RAISE NOTICE '💡 Run recalculate_all_ranks_with_ties() to update existing rankings';
END $$;