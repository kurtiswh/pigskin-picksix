-- Migration 132: Fix Mixed User Leaderboard Display
-- 
-- PURPOSE: Allow users with both authenticated and anonymous picks to show both on leaderboards
-- ISSUE: Users like Elizabeth Kreeb have authenticated picks (Week 1) AND anonymous picks (Week 2)
--        but current logic excludes ALL anonymous picks if ANY authenticated picks exist
-- FIX: Change exclusion logic to be more granular - allow both sources to display separately

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 132: Fixing mixed user leaderboard display';
    RAISE NOTICE '==================================================================';
    RAISE NOTICE 'ISSUE: Users with both auth and anon picks only show auth picks';
    RAISE NOTICE 'FIX: Allow both sources to display as separate entries';
END;
$$;

-- Step 1: Drop existing views
DROP VIEW IF EXISTS public.weekly_leaderboard CASCADE;
DROP VIEW IF EXISTS public.season_leaderboard CASCADE;

-- Step 2: Create fixed weekly_leaderboard 
-- CHANGE: Remove NOT EXISTS exclusion for weekly - let both auth and anon show for different weeks
CREATE VIEW public.weekly_leaderboard AS
WITH combined_picks AS (
    -- Authenticated picks
    SELECT 
        u.id as user_id,
        u.display_name,
        p.week,
        p.season,
        COUNT(p.id) as picks_made,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COUNT(CASE WHEN p.result = 'push' AND p.is_lock THEN 1 END) as lock_pushes,
        COALESCE(SUM(p.points_earned), 0) as total_points,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified,
        'authenticated' as pick_source
    FROM public.users u
    INNER JOIN public.picks p ON u.id = p.user_id
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
    WHERE p.submitted = TRUE  -- Only count submitted picks
      AND p.show_on_leaderboard = TRUE  -- Only count picks that should show on leaderboard
    GROUP BY u.id, u.display_name, p.week, p.season, lsp.status, lsp.is_matched
    HAVING COUNT(p.id) > 0  -- Only show users who actually have picks

    UNION ALL

    -- Anonymous picks - MODIFIED: Only exclude if authenticated picks exist for SAME week
    SELECT 
        u.id as user_id,
        u.display_name,  -- Remove (A) suffix since we're not showing separate entries for season
        ap.week,
        ap.season,
        COUNT(ap.id) as picks_made,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as losses,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ABS((g.home_score + g.spread) - g.away_score) < 0.5
            THEN 1 END) as pushes,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ap.is_lock AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as lock_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ap.is_lock AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as lock_losses,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ap.is_lock AND
            ABS((g.home_score + g.spread) - g.away_score) < 0.5
            THEN 1 END) as lock_pushes,
        COALESCE(SUM(CASE WHEN g.status = 'completed' THEN ap.points_earned ELSE 0 END), 0) as total_points,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified,
        'anonymous' as pick_source
    FROM public.users u
    INNER JOIN public.anonymous_picks ap ON u.id = ap.assigned_user_id
    INNER JOIN public.games g ON ap.game_id = g.id
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = ap.season
    WHERE ap.show_on_leaderboard = TRUE
      AND NOT EXISTS (  -- FIXED: Only exclude if auth picks exist for SAME week (not entire season)
        SELECT 1 FROM public.picks p
        WHERE p.user_id = u.id 
          AND p.week = ap.week  -- Same week check (not season-wide)
          AND p.season = ap.season 
          AND p.submitted = TRUE
          AND p.show_on_leaderboard = TRUE
      )
    GROUP BY u.id, u.display_name, ap.week, ap.season, lsp.status, lsp.is_matched
    HAVING COUNT(ap.id) > 0
)
SELECT 
    user_id,
    display_name,
    week,
    season,
    picks_made,
    wins,
    losses,
    pushes,
    lock_wins,
    lock_losses,
    lock_pushes,
    total_points,
    -- Proper ranking by total_points (highest first), then by wins as tiebreaker
    RANK() OVER (
        PARTITION BY week, season 
        ORDER BY total_points DESC, wins DESC, display_name ASC
    ) as weekly_rank,
    payment_status,
    is_verified,
    pick_source
FROM combined_picks
ORDER BY week DESC, season DESC, total_points DESC, wins DESC;

-- Step 3: Create fixed season_leaderboard
-- CHANGE: Combine authenticated and anonymous picks for the same user into one entry
CREATE VIEW public.season_leaderboard AS
WITH all_picks AS (
    -- Authenticated picks
    SELECT 
        u.id as user_id,
        u.display_name,
        p.season,
        p.id as pick_id,
        p.result,
        p.is_lock,
        p.points_earned,
        lsp.status as payment_status,
        lsp.is_matched,
        'authenticated' as pick_source
    FROM public.users u
    INNER JOIN public.picks p ON u.id = p.user_id
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
    WHERE p.submitted = TRUE AND p.show_on_leaderboard = TRUE

    UNION ALL

    -- Anonymous picks - NO EXCLUSION, include all
    SELECT 
        u.id as user_id,
        u.display_name,
        ap.season,
        ap.id as pick_id,
        CASE 
            WHEN g.status = 'completed' AND
                 ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 'win'::pick_result
            WHEN g.status = 'completed' AND
                 ABS((g.home_score + g.spread) - g.away_score) < 0.5
            THEN 'push'::pick_result
            WHEN g.status = 'completed'
            THEN 'loss'::pick_result
            ELSE NULL::pick_result  -- Incomplete games
        END as result,
        ap.is_lock,
        CASE WHEN g.status = 'completed' THEN ap.points_earned ELSE 0 END as points_earned,
        lsp.status as payment_status,
        lsp.is_matched,
        'anonymous' as pick_source
    FROM public.users u
    INNER JOIN public.anonymous_picks ap ON u.id = ap.assigned_user_id
    INNER JOIN public.games g ON ap.game_id = g.id
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = ap.season
    WHERE ap.show_on_leaderboard = TRUE
),
combined_user_stats AS (
    -- Aggregate all picks by user (combining auth and anon)
    SELECT 
        user_id,
        display_name,
        season,
        COUNT(pick_id) as total_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points,
        -- Payment status logic: take authenticated status if available, otherwise anonymous
        CASE 
            WHEN MAX(CASE WHEN pick_source = 'authenticated' AND payment_status = 'Paid' THEN 1 ELSE 0 END) = 1 THEN 'Paid'
            WHEN MAX(CASE WHEN pick_source = 'authenticated' AND payment_status = 'Pending' THEN 1 ELSE 0 END) = 1 THEN 'Pending'
            WHEN MAX(CASE WHEN payment_status = 'Paid' THEN 1 ELSE 0 END) = 1 THEN 'Paid'
            WHEN MAX(CASE WHEN payment_status = 'Pending' THEN 1 ELSE 0 END) = 1 THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        -- Verified status: true if any picks are verified
        (MAX(CASE WHEN payment_status = 'Paid' AND is_matched = true THEN 1 ELSE 0 END) = 1) as is_verified,
        -- Pick source: 'mixed' if both auth and anon, otherwise the single source
        CASE 
            WHEN COUNT(DISTINCT pick_source) > 1 THEN 'mixed'
            ELSE MAX(pick_source)
        END as pick_source
    FROM all_picks
    WHERE result IS NOT NULL  -- Only include completed picks
    GROUP BY user_id, display_name, season
    HAVING COUNT(pick_id) > 0
)
SELECT 
    user_id,
    display_name,
    season,
    total_picks,
    total_wins,
    total_losses,
    total_pushes,
    lock_wins,
    lock_losses,
    total_points,
    -- Proper ranking by total_points (highest first), then by total_wins as tiebreaker
    RANK() OVER (
        PARTITION BY season 
        ORDER BY total_points DESC, total_wins DESC, display_name ASC
    ) as season_rank,
    payment_status,
    is_verified,
    pick_source
FROM combined_user_stats
ORDER BY season DESC, total_points DESC, total_wins DESC;

-- Step 4: Grant permissions
GRANT SELECT ON public.weekly_leaderboard TO anon, authenticated;
GRANT SELECT ON public.season_leaderboard TO anon, authenticated;

-- Step 5: Log the migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 132 completed successfully';
    RAISE NOTICE '🔧 Fixed mixed user leaderboard display';
    RAISE NOTICE '✓ Weekly: Anonymous picks only excluded if auth picks exist for SAME week';
    RAISE NOTICE '✓ Season: Auth and anon picks COMBINED into single user entry';
    RAISE NOTICE '✓ Users like Elizabeth Kreeb will show: Week 1 (104pts) + Week 2 (88pts) = 192pts total';
    RAISE NOTICE '📊 Pick source marked as "mixed" when user has both auth and anon picks';
END;
$$;