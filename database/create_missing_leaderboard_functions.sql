-- Create Missing Leaderboard Functions
-- This script creates all the leaderboard functions that are missing

DO $$
BEGIN
    RAISE NOTICE '🔧 Creating missing leaderboard functions';
    RAISE NOTICE '=========================================';
END;
$$;

-- Function 1: Full leaderboard refresh for all users
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

-- Function 2: Get user picks visibility summary for admin interface
CREATE OR REPLACE FUNCTION public.get_user_picks_visibility_summary(
    target_season INTEGER
)
RETURNS TABLE(
    user_id UUID,
    display_name TEXT,
    total_auth_picks INTEGER,
    total_anon_picks INTEGER,
    hidden_auth_picks INTEGER,
    hidden_anon_picks INTEGER,
    payment_status TEXT,
    on_leaderboard BOOLEAN
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH user_auth_picks AS (
        SELECT 
            p.user_id,
            COUNT(*) as total_picks,
            COUNT(CASE WHEN COALESCE(p.show_on_leaderboard, TRUE) = FALSE THEN 1 END) as hidden_picks
        FROM public.picks p
        WHERE p.season = target_season
        AND p.submitted_at IS NOT NULL
        GROUP BY p.user_id
    ),
    user_anon_picks AS (
        SELECT 
            ap.assigned_user_id as user_id,
            COUNT(*) as total_picks,
            COUNT(CASE WHEN ap.show_on_leaderboard = FALSE THEN 1 END) as hidden_picks
        FROM public.anonymous_picks ap
        WHERE ap.season = target_season
        AND ap.assigned_user_id IS NOT NULL
        AND ap.validation_status IN ('auto_validated', 'manually_validated')
        GROUP BY ap.assigned_user_id
    ),
    all_users AS (
        SELECT user_id FROM user_auth_picks
        UNION 
        SELECT user_id FROM user_anon_picks
        WHERE user_id IS NOT NULL
    )
    SELECT 
        u.id as user_id,
        u.display_name,
        COALESCE(uap.total_picks, 0)::INTEGER as total_auth_picks,
        COALESCE(uan.total_picks, 0)::INTEGER as total_anon_picks,
        COALESCE(uap.hidden_picks, 0)::INTEGER as hidden_auth_picks,
        COALESCE(uan.hidden_picks, 0)::INTEGER as hidden_anon_picks,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        (sl.user_id IS NOT NULL) as on_leaderboard
    FROM all_users au
    JOIN public.users u ON au.user_id = u.id
    LEFT JOIN user_auth_picks uap ON u.id = uap.user_id
    LEFT JOIN user_anon_picks uan ON u.id = uan.user_id
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = target_season
    LEFT JOIN public.season_leaderboard sl ON u.id = sl.user_id AND sl.season = target_season
    ORDER BY u.display_name;
END;
$$;

-- Function 3: Simplified recalculate functions (if they don't exist)
-- Check if recalculate_season_leaderboard_for_user exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'recalculate_season_leaderboard_for_user'
        AND pronargs = 2
    ) THEN
        -- Create a basic version
        CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard_for_user(
            target_user_id UUID,
            target_season INTEGER
        )
        RETURNS VOID
        SECURITY DEFINER
        LANGUAGE plpgsql AS $func$
        DECLARE
            user_info RECORD;
            stats RECORD;
        BEGIN
            -- Get user info
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
            
            -- Calculate stats from picks
            SELECT 
                COUNT(*) as total_picks,
                COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
                COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
                COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
                COUNT(CASE WHEN result = 'win' AND is_lock THEN 1 END) as lock_wins,
                COUNT(CASE WHEN result = 'loss' AND is_lock THEN 1 END) as lock_losses,
                COALESCE(SUM(points_earned), 0) as total_points
            INTO stats
            FROM public.picks 
            WHERE user_id = target_user_id 
                AND season = target_season
                AND submitted_at IS NOT NULL
                AND COALESCE(show_on_leaderboard, TRUE) = TRUE;
            
            -- Insert or update season leaderboard
            IF stats.total_picks > 0 THEN
                INSERT INTO public.season_leaderboard (
                    user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
                    lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
                ) VALUES (
                    target_user_id, user_info.display_name, target_season, 
                    stats.total_picks, stats.wins, stats.losses, stats.pushes,
                    stats.lock_wins, stats.lock_losses, stats.total_points,
                    user_info.payment_status, user_info.is_verified, 'authenticated'
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
        $func$;
        
        RAISE NOTICE '✅ Created recalculate_season_leaderboard_for_user function';
    ELSE
        RAISE NOTICE '✅ recalculate_season_leaderboard_for_user already exists';
    END IF;
END;
$$;

-- Check if recalculate_weekly_leaderboard_for_user exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'recalculate_weekly_leaderboard_for_user'
        AND pronargs = 3
    ) THEN
        -- Create a basic version
        CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard_for_user(
            target_user_id UUID,
            target_week INTEGER,
            target_season INTEGER
        )
        RETURNS VOID
        SECURITY DEFINER
        LANGUAGE plpgsql AS $func$
        DECLARE
            user_info RECORD;
            stats RECORD;
        BEGIN
            -- Get user info
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
            
            -- Calculate stats from picks
            SELECT 
                COUNT(*) as picks_made,
                COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
                COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
                COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
                COUNT(CASE WHEN result = 'win' AND is_lock THEN 1 END) as lock_wins,
                COUNT(CASE WHEN result = 'loss' AND is_lock THEN 1 END) as lock_losses,
                COALESCE(SUM(points_earned), 0) as total_points
            INTO stats
            FROM public.picks 
            WHERE user_id = target_user_id 
                AND week = target_week
                AND season = target_season
                AND submitted_at IS NOT NULL
                AND COALESCE(show_on_leaderboard, TRUE) = TRUE;
            
            -- Insert or update weekly leaderboard
            IF stats.picks_made > 0 THEN
                INSERT INTO public.weekly_leaderboard (
                    user_id, display_name, week, season, picks_made, wins, losses, pushes,
                    lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
                ) VALUES (
                    target_user_id, user_info.display_name, target_week, target_season,
                    stats.picks_made, stats.wins, stats.losses, stats.pushes,
                    stats.lock_wins, stats.lock_losses, stats.total_points,
                    user_info.payment_status, user_info.is_verified, 'authenticated'
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
        $func$;
        
        RAISE NOTICE '✅ Created recalculate_weekly_leaderboard_for_user function';
    ELSE
        RAISE NOTICE '✅ recalculate_weekly_leaderboard_for_user already exists';
    END IF;
END;
$$;

-- Add comments
COMMENT ON FUNCTION public.refresh_all_leaderboards IS 
'Rebuilds all leaderboard entries for a season, including ALL users with picks regardless of payment status';

COMMENT ON FUNCTION public.get_user_picks_visibility_summary IS 
'Admin function: Get summary of user picks and their leaderboard visibility status for admin interface';

-- Summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Missing leaderboard functions have been created!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Functions now available:';
    RAISE NOTICE '   - refresh_all_leaderboards(season)';
    RAISE NOTICE '   - get_user_picks_visibility_summary(season)';
    RAISE NOTICE '   - recalculate_season_leaderboard_for_user(user_id, season)';
    RAISE NOTICE '   - recalculate_weekly_leaderboard_for_user(user_id, week, season)';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 You can now:';
    RAISE NOTICE '   1. Run: SELECT * FROM refresh_all_leaderboards(2025);';
    RAISE NOTICE '   2. Use the Admin Leaderboard interface';
    RAISE NOTICE '';
END;
$$;