-- Migration: Comprehensive leaderboard refresh with error recovery
-- Provides multiple strategies for rebuilding leaderboards when issues occur
-- Includes diagnostic tools and manual override capabilities

-- ===================================================================
-- COMPREHENSIVE LEADERBOARD REFRESH AND RECOVERY SYSTEM
-- ===================================================================

-- Function to completely rebuild season leaderboard from picks data
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
    
    -- Update all ranks for affected seasons
    FOR user_rec IN 
        SELECT DISTINCT season 
        FROM public.season_leaderboard 
        WHERE (target_season IS NULL OR season = target_season)
    LOOP
        BEGIN
            WITH ranked_entries AS (
                SELECT 
                    id, 
                    ROW_NUMBER() OVER (ORDER BY total_points DESC, total_wins DESC) as new_rank
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

-- Function to completely rebuild weekly leaderboard from picks data
CREATE OR REPLACE FUNCTION public.rebuild_weekly_leaderboard(
    target_season INTEGER DEFAULT NULL,
    target_week INTEGER DEFAULT NULL,
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
    scope_filter TEXT;
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
    
    -- Determine scope
    scope_filter := 'week ' || COALESCE(target_week::TEXT, 'all') || ' of season ' || COALESCE(target_season::TEXT, 'all');
    
    -- Clear existing entries if force rebuild
    IF force_rebuild THEN
        DELETE FROM public.weekly_leaderboard 
        WHERE (target_season IS NULL OR season = target_season)
          AND (target_week IS NULL OR week = target_week)
          AND (target_user_id IS NULL OR user_id = target_user_id);
    END IF;
    
    -- Process each user/week/season combination with picks
    FOR user_rec IN 
        SELECT DISTINCT p.user_id, p.week, p.season, u.display_name
        FROM public.picks p
        JOIN public.users u ON u.id = p.user_id
        WHERE (target_season IS NULL OR p.season = target_season)
          AND (target_week IS NULL OR p.week = target_week)
          AND (target_user_id IS NULL OR p.user_id = target_user_id)
          AND p.show_on_leaderboard = true
    LOOP
        BEGIN
            users_processed := users_processed + 1;
            
            -- Calculate stats for this user/week/season (only visible picks)
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
            WHERE p.user_id = user_rec.user_id
              AND p.week = user_rec.week
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
            INSERT INTO public.weekly_leaderboard (
                user_id, display_name, week, season, picks_made, wins, losses, pushes,
                lock_wins, lock_losses, total_points, weekly_rank, payment_status, is_verified
            ) VALUES (
                user_rec.user_id,
                COALESCE(user_rec.display_name, 'User ' || SUBSTRING(user_rec.user_id::TEXT, 1, 8)),
                user_rec.week,
                user_rec.season,
                user_stats.picks_made,
                user_stats.wins,
                user_stats.losses,
                user_stats.pushes,
                user_stats.lock_wins,
                user_stats.lock_losses,
                user_stats.total_points,
                1, -- Temporary rank
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
                
            -- Track if this was insert or update
            GET DIAGNOSTICS entries_created = ROW_COUNT;
            IF entries_created = 1 THEN
                entries_created := entries_created + 1;
            ELSE
                entries_updated := entries_updated + 1;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            errors_encountered := errors_encountered + 1;
            error_log := error_log || 'User ' || user_rec.user_id || ' week ' || user_rec.week || ' season ' || user_rec.season || ': ' || SQLERRM || '; ';
        END;
    END LOOP;
    
    -- Update ranks for affected week/season combinations
    FOR user_rec IN 
        SELECT DISTINCT week, season 
        FROM public.weekly_leaderboard 
        WHERE (target_season IS NULL OR season = target_season)
          AND (target_week IS NULL OR week = target_week)
    LOOP
        BEGIN
            WITH ranked_entries AS (
                SELECT 
                    id, 
                    ROW_NUMBER() OVER (ORDER BY total_points DESC, wins DESC) as new_rank
                FROM public.weekly_leaderboard
                WHERE week = user_rec.week
                  AND season = user_rec.season
            )
            UPDATE public.weekly_leaderboard wl
            SET weekly_rank = ranked_entries.new_rank
            FROM ranked_entries
            WHERE wl.id = ranked_entries.id;
            
        EXCEPTION WHEN OTHERS THEN
            error_log := error_log || 'Rank update for week ' || user_rec.week || ' season ' || user_rec.season || ': ' || SQLERRM || '; ';
        END;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'operation', 'Weekly leaderboard rebuild',
        'scope', scope_filter,
        'users_processed', users_processed,
        'entries_created', entries_created,
        'entries_updated', entries_updated,
        'errors_encountered', errors_encountered,
        'error_log', NULLIF(error_log, ''),
        'admin_user', admin_user.email
    );
END;
$$;

-- Diagnostic function to check leaderboard health
CREATE OR REPLACE FUNCTION public.diagnose_leaderboard_health(
    target_season INTEGER DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    admin_user RECORD;
    season_issues JSONB := '[]'::JSONB;
    weekly_issues JSONB := '[]'::JSONB;
    picks_stats RECORD;
    season_stats RECORD;
    weekly_stats RECORD;
    issue_rec RECORD;
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
    
    -- Get overall picks statistics
    SELECT 
        COUNT(DISTINCT user_id) as total_users,
        COUNT(DISTINCT season) as total_seasons,
        COUNT(DISTINCT week) as total_weeks,
        COUNT(*) as total_picks,
        COUNT(CASE WHEN show_on_leaderboard = true THEN 1 END) as visible_picks,
        COUNT(CASE WHEN show_on_leaderboard = false THEN 1 END) as hidden_picks
    INTO picks_stats
    FROM public.picks
    WHERE (target_season IS NULL OR season = target_season);
    
    -- Get season leaderboard statistics
    SELECT 
        COUNT(DISTINCT user_id) as users_in_leaderboard,
        COUNT(*) as total_entries,
        COUNT(CASE WHEN total_points = 0 THEN 1 END) as zero_point_entries
    INTO season_stats
    FROM public.season_leaderboard
    WHERE (target_season IS NULL OR season = target_season);
    
    -- Get weekly leaderboard statistics
    SELECT 
        COUNT(DISTINCT user_id) as users_in_leaderboard,
        COUNT(*) as total_entries,
        COUNT(CASE WHEN total_points = 0 THEN 1 END) as zero_point_entries
    INTO weekly_stats
    FROM public.weekly_leaderboard
    WHERE (target_season IS NULL OR season = target_season);
    
    -- Check for users with picks but missing from season leaderboard
    FOR issue_rec IN
        SELECT DISTINCT p.user_id, p.season, u.display_name
        FROM public.picks p
        JOIN public.users u ON u.id = p.user_id
        LEFT JOIN public.season_leaderboard sl ON sl.user_id = p.user_id AND sl.season = p.season
        WHERE (target_season IS NULL OR p.season = target_season)
          AND p.show_on_leaderboard = true
          AND sl.user_id IS NULL
    LOOP
        season_issues := season_issues || jsonb_build_object(
            'issue', 'missing_from_leaderboard',
            'user_id', issue_rec.user_id,
            'display_name', issue_rec.display_name,
            'season', issue_rec.season
        );
    END LOOP;
    
    -- Check for users with picks but missing from weekly leaderboard
    FOR issue_rec IN
        SELECT DISTINCT p.user_id, p.week, p.season, u.display_name
        FROM public.picks p
        JOIN public.users u ON u.id = p.user_id
        LEFT JOIN public.weekly_leaderboard wl ON wl.user_id = p.user_id AND wl.week = p.week AND wl.season = p.season
        WHERE (target_season IS NULL OR p.season = target_season)
          AND p.show_on_leaderboard = true
          AND wl.user_id IS NULL
    LOOP
        weekly_issues := weekly_issues || jsonb_build_object(
            'issue', 'missing_from_leaderboard',
            'user_id', issue_rec.user_id,
            'display_name', issue_rec.display_name,
            'week', issue_rec.week,
            'season', issue_rec.season
        );
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'diagnosis_scope', CASE WHEN target_season IS NULL THEN 'all seasons' ELSE 'season ' || target_season END,
        'picks_statistics', jsonb_build_object(
            'total_users', picks_stats.total_users,
            'total_seasons', picks_stats.total_seasons,
            'total_weeks', picks_stats.total_weeks,
            'total_picks', picks_stats.total_picks,
            'visible_picks', picks_stats.visible_picks,
            'hidden_picks', picks_stats.hidden_picks
        ),
        'season_leaderboard_statistics', jsonb_build_object(
            'users_in_leaderboard', season_stats.users_in_leaderboard,
            'total_entries', season_stats.total_entries,
            'zero_point_entries', season_stats.zero_point_entries
        ),
        'weekly_leaderboard_statistics', jsonb_build_object(
            'users_in_leaderboard', weekly_stats.users_in_leaderboard,
            'total_entries', weekly_stats.total_entries,
            'zero_point_entries', weekly_stats.zero_point_entries
        ),
        'season_leaderboard_issues', season_issues,
        'weekly_leaderboard_issues', weekly_issues,
        'health_status', CASE 
            WHEN jsonb_array_length(season_issues) = 0 AND jsonb_array_length(weekly_issues) = 0 
            THEN 'healthy' 
            ELSE 'issues_detected' 
        END,
        'admin_user', admin_user.email
    );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.rebuild_season_leaderboard(INTEGER, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_weekly_leaderboard(INTEGER, INTEGER, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.diagnose_leaderboard_health(INTEGER) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 113: Comprehensive leaderboard refresh system created';
    RAISE NOTICE '';
    RAISE NOTICE '🛠️  AVAILABLE FUNCTIONS:';
    RAISE NOTICE '• rebuild_season_leaderboard(season, user_id, force_rebuild)';
    RAISE NOTICE '• rebuild_weekly_leaderboard(season, week, user_id, force_rebuild)';
    RAISE NOTICE '• diagnose_leaderboard_health(season)';
    RAISE NOTICE '• manual_refresh_user_leaderboards(user_id, season, week)';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 CAPABILITIES:';
    RAISE NOTICE '• Complete leaderboard rebuilds from picks data';
    RAISE NOTICE '• Individual user/season/week targeting';
    RAISE NOTICE '• Force rebuild with data clearing';
    RAISE NOTICE '• Health diagnostics and issue detection';
    RAISE NOTICE '• Comprehensive error logging and recovery';
    RAISE NOTICE '';
    RAISE NOTICE '💡 Use diagnose_leaderboard_health() to identify issues';
    RAISE NOTICE '💡 Use rebuild functions to fix missing or incorrect data';
END;
$$;