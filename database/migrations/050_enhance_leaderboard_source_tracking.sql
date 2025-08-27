-- Migration 050: Enhance leaderboard source tracking and fix verification filtering
-- 
-- PROBLEM: Auto-validated anonymous picks not appearing on leaderboards
-- - LeaderboardService filters by is_verified=true, excluding users with only anonymous picks
-- - pick_source column exists but needs better logic for mixed sources
-- - Need manual refresh function for admin use after bulk processing
--
-- SOLUTION: Enhance leaderboard functions to properly handle mixed pick sources
-- and provide better tools for anonymous pick integration

-- ===================================================================
-- PHASE 1: Enhance leaderboard functions with better source detection
-- ===================================================================

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
    
    -- Add stats from anonymous picks that should show on leaderboard
    SELECT 
        COUNT(*) as anon_picks,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND
             ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
            THEN 1 END) as anon_wins,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND
             NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
             (g.home_score + g.spread) != g.away_score)
            THEN 1 END) as anon_losses,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND (g.home_score + g.spread) = g.away_score)
            THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND ap.is_lock = true AND
             ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
            THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND ap.is_lock = true AND
             NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
             (g.home_score + g.spread) != g.away_score)
            THEN 1 END) as anon_lock_losses,
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
        END), 0) as anon_points
    INTO anonymous_stats
    FROM public.anonymous_picks ap
    LEFT JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = true;
    
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
END;
$$;

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
    
    -- Add stats from anonymous picks that should show on leaderboard
    SELECT 
        COUNT(*) as anon_picks,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND
             ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
            THEN 1 END) as anon_wins,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND
             NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
             (g.home_score + g.spread) != g.away_score)
            THEN 1 END) as anon_losses,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND (g.home_score + g.spread) = g.away_score)
            THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND ap.is_lock = true AND
             ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
            THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND ap.is_lock = true AND
             NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
             (g.home_score + g.spread) != g.away_score)
            THEN 1 END) as anon_lock_losses,
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
        END), 0) as anon_points
    INTO anonymous_stats
    FROM public.anonymous_picks ap
    LEFT JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.week = target_week
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = true;
    
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
END;
$$;

-- ===================================================================
-- PHASE 2: Add admin utility functions
-- ===================================================================

-- Function to manually refresh all leaderboards for a specific season
CREATE OR REPLACE FUNCTION public.refresh_season_leaderboards(target_season INTEGER)
RETURNS TEXT
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_record RECORD;
    user_count INTEGER := 0;
BEGIN
    -- Get all users who have picks (authenticated or anonymous) for this season
    FOR user_record IN 
        SELECT DISTINCT user_id 
        FROM (
            SELECT user_id FROM public.picks WHERE season = target_season
            UNION
            SELECT assigned_user_id as user_id FROM public.anonymous_picks 
            WHERE season = target_season AND assigned_user_id IS NOT NULL AND show_on_leaderboard = true
        ) AS all_users
        WHERE user_id IS NOT NULL
    LOOP
        -- Update season leaderboard for this user
        PERFORM public.update_season_leaderboard_with_source(user_record.user_id, target_season, 'mixed');
        user_count := user_count + 1;
    END LOOP;
    
    RETURN 'Refreshed season leaderboards for ' || user_count || ' users in season ' || target_season;
END;
$$;

-- Function to manually refresh weekly leaderboards for a specific week/season
CREATE OR REPLACE FUNCTION public.refresh_weekly_leaderboards(target_week INTEGER, target_season INTEGER)
RETURNS TEXT
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_record RECORD;
    user_count INTEGER := 0;
BEGIN
    -- Get all users who have picks (authenticated or anonymous) for this week/season
    FOR user_record IN 
        SELECT DISTINCT user_id 
        FROM (
            SELECT user_id FROM public.picks WHERE week = target_week AND season = target_season
            UNION
            SELECT assigned_user_id as user_id FROM public.anonymous_picks 
            WHERE week = target_week AND season = target_season AND assigned_user_id IS NOT NULL AND show_on_leaderboard = true
        ) AS all_users
        WHERE user_id IS NOT NULL
    LOOP
        -- Update weekly leaderboard for this user
        PERFORM public.update_weekly_leaderboard_with_source(user_record.user_id, target_week, target_season, 'mixed');
        user_count := user_count + 1;
    END LOOP;
    
    RETURN 'Refreshed weekly leaderboards for ' || user_count || ' users in week ' || target_week || ' of season ' || target_season;
END;
$$;

-- ===================================================================
-- PHASE 3: Update existing leaderboard entries to use enhanced source logic
-- ===================================================================

-- Update pick_source values to use new 'mixed' logic where appropriate
UPDATE public.season_leaderboard 
SET pick_source = 'mixed'
WHERE user_id IN (
    -- Users who have both authenticated and anonymous picks for this season
    SELECT s.user_id 
    FROM public.season_leaderboard s
    WHERE EXISTS (
        SELECT 1 FROM public.picks p 
        WHERE p.user_id = s.user_id AND p.season = s.season
    )
    AND EXISTS (
        SELECT 1 FROM public.anonymous_picks ap
        WHERE ap.assigned_user_id = s.user_id AND ap.season = s.season 
        AND ap.show_on_leaderboard = true
    )
);

UPDATE public.weekly_leaderboard 
SET pick_source = 'mixed'
WHERE user_id IN (
    -- Users who have both authenticated and anonymous picks for this week/season
    SELECT w.user_id 
    FROM public.weekly_leaderboard w
    WHERE EXISTS (
        SELECT 1 FROM public.picks p 
        WHERE p.user_id = w.user_id AND p.week = w.week AND p.season = w.season
    )
    AND EXISTS (
        SELECT 1 FROM public.anonymous_picks ap
        WHERE ap.assigned_user_id = w.user_id AND ap.week = w.week AND ap.season = w.season 
        AND ap.show_on_leaderboard = true
    )
);

-- ===================================================================
-- PHASE 4: Comments and completion
-- ===================================================================

COMMENT ON FUNCTION public.update_season_leaderboard_with_source(UUID, INTEGER, VARCHAR) IS 'Enhanced function that properly detects mixed pick sources (authenticated + anonymous)';
COMMENT ON FUNCTION public.update_weekly_leaderboard_with_source(UUID, INTEGER, INTEGER, VARCHAR) IS 'Enhanced function that properly detects mixed pick sources (authenticated + anonymous)';
COMMENT ON FUNCTION public.refresh_season_leaderboards(INTEGER) IS 'Admin utility to manually refresh all season leaderboards including anonymous picks';
COMMENT ON FUNCTION public.refresh_weekly_leaderboards(INTEGER, INTEGER) IS 'Admin utility to manually refresh weekly leaderboards including anonymous picks';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 050 completed: Enhanced Leaderboard Source Tracking';
    RAISE NOTICE 'Features added:';
    RAISE NOTICE '- Enhanced pick_source detection (authenticated/anonymous/mixed)';
    RAISE NOTICE '- Admin utility functions for manual leaderboard refresh';
    RAISE NOTICE '- Updated existing leaderboard entries to use mixed source logic';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '- Update LeaderboardService to query pick_source column';
    RAISE NOTICE '- Add Source column to frontend leaderboard displays';
    RAISE NOTICE '- Test anonymous picks integration end-to-end';
END $$;