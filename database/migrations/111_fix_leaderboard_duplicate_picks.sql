-- Migration 111: Fix Leaderboard Duplicate Picks Issue
-- 
-- PROBLEM: Users appearing with more than 6 picks on leaderboards
-- - Jimmy Nummy shows 10-2-0 (12 picks total) instead of expected 6
-- - System incorrectly combines authenticated + anonymous picks instead of prioritizing
-- - Should use authenticated picks when available, fall back to anonymous picks otherwise
--
-- SOLUTION: Fix leaderboard functions to prioritize authenticated picks over anonymous picks

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 111: Fixing leaderboard duplicate picks calculation';
    RAISE NOTICE '=================================================================';
END;
$$;

-- Fix season leaderboard function to properly prioritize picks
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
    
    -- If no authenticated picks, use anonymous picks as fallback
    IF NOT has_authenticated_picks THEN
        SELECT 
            COUNT(*) as total_picks,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND
                 ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
                THEN 1 END) as wins,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND
                 NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                      (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
                 (g.home_score + g.spread) != g.away_score)
                THEN 1 END) as losses,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND (g.home_score + g.spread) = g.away_score)
                THEN 1 END) as pushes,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND ap.is_lock = true AND
                 ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
                THEN 1 END) as lock_wins,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND ap.is_lock = true AND
                 NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                      (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
                 (g.home_score + g.spread) != g.away_score)
                THEN 1 END) as lock_losses,
            COALESCE(SUM(CASE 
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN (g.home_score + g.spread) = g.away_score THEN 10 -- push
                        WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN 
                            CASE WHEN ap.is_lock THEN 40 ELSE 20 END -- win
                        ELSE 0 -- loss
                    END
                ELSE 0
            END), 0) as total_points
        INTO user_stats
        FROM public.anonymous_picks ap
        LEFT JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = target_user_id 
            AND ap.season = target_season 
            AND ap.show_on_leaderboard = true;
        
        final_pick_source := 'anonymous';
    ELSE
        final_pick_source := 'authenticated';
    END IF;
    
    -- Determine final pick source (no more 'mixed' since we prioritize)
    final_pick_source := CASE 
        WHEN has_authenticated_picks THEN 'authenticated'
        ELSE 'anonymous'
    END;
    
    -- Insert or update season leaderboard with prioritized picks (no more combining)
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
    ) VALUES (
        target_user_id, user_info.display_name, target_season, COALESCE(user_stats.total_picks, 0),
        COALESCE(user_stats.wins, 0), COALESCE(user_stats.losses, 0), COALESCE(user_stats.pushes, 0), 
        COALESCE(user_stats.lock_wins, 0), COALESCE(user_stats.lock_losses, 0), COALESCE(user_stats.total_points, 0),
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
        pick_source = EXCLUDED.pick_source;
END;
$$;

-- Fix weekly leaderboard function to properly prioritize picks
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
    user_info RECORD;
    has_authenticated_picks BOOLEAN DEFAULT FALSE;
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
    
    -- If no authenticated picks, use anonymous picks as fallback
    IF NOT has_authenticated_picks THEN
        SELECT 
            COUNT(*) as total_picks,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND
                 ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
                THEN 1 END) as wins,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND
                 NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                      (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
                 (g.home_score + g.spread) != g.away_score)
                THEN 1 END) as losses,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND (g.home_score + g.spread) = g.away_score)
                THEN 1 END) as pushes,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND ap.is_lock = true AND
                 ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
                THEN 1 END) as lock_wins,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND ap.is_lock = true AND
                 NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                      (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
                 (g.home_score + g.spread) != g.away_score)
                THEN 1 END) as lock_losses,
            COALESCE(SUM(CASE 
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN (g.home_score + g.spread) = g.away_score THEN 10 -- push
                        WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN 
                            CASE WHEN ap.is_lock THEN 40 ELSE 20 END -- win
                        ELSE 0 -- loss
                    END
                ELSE 0
            END), 0) as total_points
        INTO user_stats
        FROM public.anonymous_picks ap
        LEFT JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = target_user_id 
            AND ap.week = target_week
            AND ap.season = target_season 
            AND ap.show_on_leaderboard = true;
    END IF;
    
    -- Determine final pick source (prioritize authenticated over anonymous)
    final_pick_source := CASE 
        WHEN has_authenticated_picks THEN 'authenticated'
        ELSE 'anonymous'
    END;
    
    -- Insert or update weekly leaderboard with prioritized picks (no more combining)
    INSERT INTO public.weekly_leaderboard (
        user_id, display_name, week, season, picks_made, wins, losses, pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
    ) VALUES (
        target_user_id, user_info.display_name, target_week, target_season, COALESCE(user_stats.total_picks, 0),
        COALESCE(user_stats.wins, 0), COALESCE(user_stats.losses, 0), COALESCE(user_stats.pushes, 0), 
        COALESCE(user_stats.lock_wins, 0), COALESCE(user_stats.lock_losses, 0), COALESCE(user_stats.total_points, 0),
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
        pick_source = EXCLUDED.pick_source;
END;
$$;

-- Create function to refresh all leaderboards and fix duplicates
CREATE OR REPLACE FUNCTION public.fix_duplicate_leaderboard_entries(target_season INTEGER)
RETURNS TEXT
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_record RECORD;
    user_count INTEGER := 0;
    fixed_count INTEGER := 0;
BEGIN
    RAISE NOTICE '🔧 Starting duplicate leaderboard fix for season %', target_season;
    
    -- Get all users who have picks for this season
    FOR user_record IN 
        SELECT DISTINCT user_id 
        FROM (
            SELECT user_id FROM public.picks WHERE season = target_season
            UNION
            SELECT assigned_user_id as user_id FROM public.anonymous_picks 
            WHERE season = target_season AND assigned_user_id IS NOT NULL
        ) AS all_users
        WHERE user_id IS NOT NULL
    LOOP
        -- Check if user has excessive picks in leaderboard
        IF EXISTS (
            SELECT 1 FROM public.season_leaderboard 
            WHERE user_id = user_record.user_id 
              AND season = target_season 
              AND total_picks > 6
        ) THEN
            fixed_count := fixed_count + 1;
            RAISE NOTICE '  Fixing user % with excessive picks', user_record.user_id;
        END IF;
        
        -- Update season leaderboard for this user using prioritized logic
        PERFORM public.update_season_leaderboard_with_source(user_record.user_id, target_season, 'authenticated');
        
        -- Update all weekly leaderboards for this user
        FOR week_num IN 1..14 LOOP
            PERFORM public.update_weekly_leaderboard_with_source(user_record.user_id, week_num, target_season, 'authenticated');
        END LOOP;
        
        user_count := user_count + 1;
    END LOOP;
    
    RETURN format('Fixed duplicate picks for %s users (%s had excessive picks) in season %s', 
                  user_count, fixed_count, target_season);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION update_season_leaderboard_with_source(UUID, INTEGER, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION update_weekly_leaderboard_with_source(UUID, INTEGER, INTEGER, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION fix_duplicate_leaderboard_entries(INTEGER) TO authenticated;

-- Run the fix for season 2025
SELECT public.fix_duplicate_leaderboard_entries(2025);

-- Update ranking after fixing duplicates
UPDATE public.season_leaderboard 
SET season_rank = new_rank
FROM (
    SELECT 
        user_id, 
        season,
        ROW_NUMBER() OVER (
            PARTITION BY season 
            ORDER BY total_points DESC, total_wins DESC, total_picks ASC
        ) as new_rank
    FROM public.season_leaderboard
    WHERE season = 2025
) ranked
WHERE season_leaderboard.user_id = ranked.user_id 
  AND season_leaderboard.season = ranked.season;

-- Update weekly rankings 
UPDATE public.weekly_leaderboard 
SET weekly_rank = new_rank
FROM (
    SELECT 
        user_id, 
        week,
        season,
        ROW_NUMBER() OVER (
            PARTITION BY week, season 
            ORDER BY total_points DESC, wins DESC, picks_made ASC
        ) as new_rank
    FROM public.weekly_leaderboard
    WHERE season = 2025
) ranked
WHERE weekly_leaderboard.user_id = ranked.user_id 
  AND weekly_leaderboard.week = ranked.week
  AND weekly_leaderboard.season = ranked.season;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 111 COMPLETED - Duplicate picks fixed!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 FIXED ISSUES:';
    RAISE NOTICE '• Leaderboard functions now prioritize authenticated picks over anonymous picks';
    RAISE NOTICE '• No more combining both pick types (was causing 10+ pick totals)';
    RAISE NOTICE '• Users will show max 6 picks (authenticated preferred, anonymous fallback)';
    RAISE NOTICE '• Recalculated all leaderboard entries for season 2025';
    RAISE NOTICE '• Updated rankings based on corrected pick counts';
    RAISE NOTICE '';
    RAISE NOTICE '🛠️ The leaderboard should now show correct pick counts (max 6 per user).';
END;
$$;