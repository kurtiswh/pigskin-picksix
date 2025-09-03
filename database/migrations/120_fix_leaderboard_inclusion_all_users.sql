-- Migration 120: Fix Leaderboard to Include All Users with Picks
-- 
-- PURPOSE: Ensure all users with picks appear on leaderboard regardless of payment status
-- - Updates recalculation functions to include all users
-- - Adds manual refresh function for immediate fix
-- - Properly handles anonymous picks with show_on_leaderboard flag

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 120: Fix leaderboard to include all users with picks';
    RAISE NOTICE '=================================================================';
END;
$$;

-- Function 1: Enhanced season leaderboard recalculation for a specific user
-- This properly combines authenticated and anonymous picks
CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard_for_user(
    target_user_id UUID,
    target_season INTEGER
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_info RECORD;
    auth_stats RECORD;
    anon_stats RECORD;
    combined_stats RECORD;
    final_pick_source VARCHAR(20);
BEGIN
    -- Get user info and payment status
    SELECT 
        u.display_name,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified
    INTO user_info
    FROM public.users u
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = target_season
    WHERE u.id = target_user_id;
    
    IF user_info IS NULL THEN
        RAISE WARNING 'User % not found', target_user_id;
        RETURN;
    END IF;
    
    -- Calculate stats from authenticated picks
    SELECT 
        COUNT(p.id) as total_picks,
        COUNT(CASE WHEN calc.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN calc.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN calc.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN calc.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN calc.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(calc.points_earned), 0) as total_points
    INTO auth_stats
    FROM public.picks p 
    JOIN public.games g ON p.game_id = g.id
    CROSS JOIN LATERAL public.calculate_pick_from_game(
        p.selected_team, 
        p.is_lock, 
        g.winner_against_spread, 
        g.base_points, 
        g.margin_bonus
    ) calc
    WHERE p.user_id = target_user_id 
        AND p.season = target_season
        AND p.submitted_at IS NOT NULL;
    
    -- Calculate stats from anonymous picks that should show on leaderboard
    SELECT 
        COUNT(ap.id) as anon_picks,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as anon_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ABS((g.home_score + g.spread) - g.away_score) < 0.5
            THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as anon_losses,
        COUNT(CASE WHEN 
            g.status = 'completed' AND ap.is_lock = true AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND ap.is_lock = true AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(ap.points_earned), 0) as anon_points
    INTO anon_stats
    FROM public.anonymous_picks ap
    LEFT JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = true
        AND ap.validation_status IN ('auto_validated', 'manually_validated');
    
    -- Determine pick source
    final_pick_source := CASE 
        WHEN COALESCE(auth_stats.total_picks, 0) > 0 AND COALESCE(anon_stats.anon_picks, 0) > 0 THEN 'mixed'
        WHEN COALESCE(anon_stats.anon_picks, 0) > 0 THEN 'anonymous'
        ELSE 'authenticated'
    END;
    
    -- Combine stats
    combined_stats := ROW(
        COALESCE(auth_stats.total_picks, 0) + COALESCE(anon_stats.anon_picks, 0),
        COALESCE(auth_stats.wins, 0) + COALESCE(anon_stats.anon_wins, 0),
        COALESCE(auth_stats.losses, 0) + COALESCE(anon_stats.anon_losses, 0),
        COALESCE(auth_stats.pushes, 0) + COALESCE(anon_stats.anon_pushes, 0),
        COALESCE(auth_stats.lock_wins, 0) + COALESCE(anon_stats.anon_lock_wins, 0),
        COALESCE(auth_stats.lock_losses, 0) + COALESCE(anon_stats.anon_lock_losses, 0),
        COALESCE(auth_stats.total_points, 0) + COALESCE(anon_stats.anon_points, 0)
    );
    
    -- Only update/insert if user has any picks
    IF combined_stats.f1 > 0 THEN
        -- Insert or update season leaderboard
        INSERT INTO public.season_leaderboard (
            user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
            lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
        ) VALUES (
            target_user_id, user_info.display_name, target_season, 
            combined_stats.f1, combined_stats.f2, combined_stats.f3, combined_stats.f4,
            combined_stats.f5, combined_stats.f6, combined_stats.f7,
            user_info.payment_status, user_info.is_verified, final_pick_source
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
            pick_source = EXCLUDED.pick_source,
            updated_at = CURRENT_TIMESTAMP;
    END IF;
END;
$$;

-- Function 2: Enhanced weekly leaderboard recalculation for a specific user
CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard_for_user(
    target_user_id UUID,
    target_week INTEGER,
    target_season INTEGER
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_info RECORD;
    auth_stats RECORD;
    anon_stats RECORD;
    combined_stats RECORD;
    final_pick_source VARCHAR(20);
BEGIN
    -- Get user info and payment status
    SELECT 
        u.display_name,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified
    INTO user_info
    FROM public.users u
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = target_season
    WHERE u.id = target_user_id;
    
    IF user_info IS NULL THEN
        RAISE WARNING 'User % not found', target_user_id;
        RETURN;
    END IF;
    
    -- Calculate stats from authenticated picks
    SELECT 
        COUNT(p.id) as picks_made,
        COUNT(CASE WHEN calc.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN calc.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN calc.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN calc.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN calc.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(calc.points_earned), 0) as total_points
    INTO auth_stats
    FROM public.picks p 
    JOIN public.games g ON p.game_id = g.id
    CROSS JOIN LATERAL public.calculate_pick_from_game(
        p.selected_team, 
        p.is_lock, 
        g.winner_against_spread, 
        g.base_points, 
        g.margin_bonus
    ) calc
    WHERE p.user_id = target_user_id 
        AND p.week = target_week
        AND p.season = target_season
        AND p.submitted_at IS NOT NULL;
    
    -- Calculate stats from anonymous picks
    SELECT 
        COUNT(ap.id) as anon_picks,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as anon_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ABS((g.home_score + g.spread) - g.away_score) < 0.5
            THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as anon_losses,
        COUNT(CASE WHEN 
            g.status = 'completed' AND ap.is_lock = true AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND ap.is_lock = true AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(ap.points_earned), 0) as anon_points
    INTO anon_stats
    FROM public.anonymous_picks ap
    LEFT JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.week = target_week
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = true
        AND ap.validation_status IN ('auto_validated', 'manually_validated');
    
    -- Determine pick source
    final_pick_source := CASE 
        WHEN COALESCE(auth_stats.picks_made, 0) > 0 AND COALESCE(anon_stats.anon_picks, 0) > 0 THEN 'mixed'
        WHEN COALESCE(anon_stats.anon_picks, 0) > 0 THEN 'anonymous'
        ELSE 'authenticated'
    END;
    
    -- Combine stats
    combined_stats := ROW(
        COALESCE(auth_stats.picks_made, 0) + COALESCE(anon_stats.anon_picks, 0),
        COALESCE(auth_stats.wins, 0) + COALESCE(anon_stats.anon_wins, 0),
        COALESCE(auth_stats.losses, 0) + COALESCE(anon_stats.anon_losses, 0),
        COALESCE(auth_stats.pushes, 0) + COALESCE(anon_stats.anon_pushes, 0),
        COALESCE(auth_stats.lock_wins, 0) + COALESCE(anon_stats.anon_lock_wins, 0),
        COALESCE(auth_stats.lock_losses, 0) + COALESCE(anon_stats.anon_lock_losses, 0),
        COALESCE(auth_stats.total_points, 0) + COALESCE(anon_stats.anon_points, 0)
    );
    
    -- Only update/insert if user has any picks
    IF combined_stats.f1 > 0 THEN
        -- Insert or update weekly leaderboard
        INSERT INTO public.weekly_leaderboard (
            user_id, display_name, week, season, picks_made, wins, losses, pushes,
            lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
        ) VALUES (
            target_user_id, user_info.display_name, target_week, target_season,
            combined_stats.f1, combined_stats.f2, combined_stats.f3, combined_stats.f4,
            combined_stats.f5, combined_stats.f6, combined_stats.f7,
            user_info.payment_status, user_info.is_verified, final_pick_source
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
            pick_source = EXCLUDED.pick_source,
            updated_at = CURRENT_TIMESTAMP;
    END IF;
END;
$$;

-- Function 3: Full leaderboard refresh for all users
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
    RAISE NOTICE '🔄 Starting full leaderboard refresh for season %', target_season;
    
    -- Process all users who have either authenticated or anonymous picks
    FOR user_rec IN 
        SELECT DISTINCT user_id FROM (
            -- Users with authenticated picks
            SELECT DISTINCT user_id 
            FROM public.picks 
            WHERE season = target_season
            AND submitted_at IS NOT NULL
            
            UNION
            
            -- Users with anonymous picks
            SELECT DISTINCT assigned_user_id as user_id
            FROM public.anonymous_picks
            WHERE season = target_season
            AND assigned_user_id IS NOT NULL
            AND show_on_leaderboard = true
            AND validation_status IN ('auto_validated', 'manually_validated')
        ) all_users
    LOOP
        total_users := total_users + 1;
        
        -- Update season leaderboard for this user
        PERFORM public.recalculate_season_leaderboard_for_user(user_rec.user_id, target_season);
        season_updates := season_updates + 1;
        
        -- Update weekly leaderboards for all weeks this user has picks
        FOR week_rec IN
            SELECT DISTINCT week FROM (
                SELECT DISTINCT week FROM public.picks 
                WHERE user_id = user_rec.user_id AND season = target_season
                UNION
                SELECT DISTINCT week FROM public.anonymous_picks
                WHERE assigned_user_id = user_rec.user_id AND season = target_season
            ) weeks
        LOOP
            PERFORM public.recalculate_weekly_leaderboard_for_user(user_rec.user_id, week_rec.week, target_season);
            weekly_updates := weekly_updates + 1;
        END LOOP;
        
        IF total_users % 10 = 0 THEN
            RAISE NOTICE '  Processed % users so far...', total_users;
        END IF;
    END LOOP;
    
    -- Update rankings for season leaderboard
    UPDATE public.season_leaderboard 
    SET season_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.season_leaderboard
        WHERE season = target_season
    ) subq
    WHERE public.season_leaderboard.id = subq.id;
    
    -- Update rankings for each week
    FOR week_rec IN
        SELECT DISTINCT week FROM public.weekly_leaderboard WHERE season = target_season
    LOOP
        UPDATE public.weekly_leaderboard 
        SET weekly_rank = subq.rank
        FROM (
            SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
            FROM public.weekly_leaderboard
            WHERE week = week_rec.week AND season = target_season
        ) subq
        WHERE public.weekly_leaderboard.id = subq.id;
    END LOOP;
    
    RAISE NOTICE '✅ Full leaderboard refresh completed: % users, % season entries, % weekly entries', 
        total_users, season_updates, weekly_updates;
    
    RETURN QUERY SELECT total_users, season_updates, weekly_updates, 
        format('Successfully refreshed leaderboards for %s users', total_users);
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Error in full leaderboard refresh: %', SQLERRM;
        RETURN QUERY SELECT 0, 0, 0, format('Error: %s', SQLERRM);
END;
$$;

-- Add comment explaining the new approach
COMMENT ON FUNCTION public.refresh_all_leaderboards IS 
'Rebuilds all leaderboard entries for a season, including ALL users with picks regardless of payment status. Use this to fix missing users on the leaderboard.';

COMMENT ON FUNCTION public.recalculate_season_leaderboard_for_user IS
'Recalculates season leaderboard entry for a specific user, combining authenticated and anonymous picks. Includes all users regardless of payment status.';

COMMENT ON FUNCTION public.recalculate_weekly_leaderboard_for_user IS
'Recalculates weekly leaderboard entry for a specific user/week, combining authenticated and anonymous picks. Includes all users regardless of payment status.';

-- Notify about the fix
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 120 complete!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 To refresh the leaderboard and include all users:';
    RAISE NOTICE '   SELECT * FROM public.refresh_all_leaderboards(2024);';
    RAISE NOTICE '';
    RAISE NOTICE '🔍 The leaderboard will now show:';
    RAISE NOTICE '   - ALL users with picks (paid and unpaid)';
    RAISE NOTICE '   - Payment status badge for transparency';
    RAISE NOTICE '   - Pick source (authenticated/anonymous/mixed)';
    RAISE NOTICE '';
END;
$$;