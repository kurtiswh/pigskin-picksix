-- Migration 131d: Fix Anonymous Picks Point Calculation
-- 
-- PURPOSE: Fix the anonymous picks point calculation to use points_earned column instead of manual calculation
-- This resolves the issue where users with 5-1-0 records were showing only 60 points instead of expected 70+ points

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 131d: Fixing anonymous picks to use stored points_earned values';
    RAISE NOTICE '===============================================================================';
END;
$$;

-- Step 1: Drop existing views
DROP VIEW IF EXISTS public.weekly_leaderboard CASCADE;
DROP VIEW IF EXISTS public.season_leaderboard CASCADE;

-- Step 2: Create weekly_leaderboard with corrected points calculation
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

    -- Anonymous picks (only for users without authenticated picks this week)
    SELECT 
        u.id as user_id,
        u.display_name,
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
        -- FIXED: Use stored points_earned instead of manual calculation
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
      AND NOT EXISTS (  -- Don't include if user has authenticated picks for this week
        SELECT 1 FROM public.picks p
        WHERE p.user_id = u.id 
          AND p.week = ap.week 
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

-- Step 3: Create season_leaderboard with corrected points calculation
CREATE VIEW public.season_leaderboard AS
WITH combined_picks AS (
    -- Authenticated picks
    SELECT 
        u.id as user_id,
        u.display_name,
        p.season,
        COUNT(p.id) as total_picks,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
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
    GROUP BY u.id, u.display_name, p.season, lsp.status, lsp.is_matched
    HAVING COUNT(p.id) > 0  -- Only show users who actually have picks

    UNION ALL

    -- Anonymous picks (only for users without authenticated picks this season)
    SELECT 
        u.id as user_id,
        u.display_name,
        ap.season,
        COUNT(ap.id) as total_picks,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as total_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as total_losses,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ABS((g.home_score + g.spread) - g.away_score) < 0.5
            THEN 1 END) as total_pushes,
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
        -- FIXED: Use stored points_earned instead of manual calculation
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
      AND NOT EXISTS (  -- Don't include if user has authenticated picks for this season
        SELECT 1 FROM public.picks p
        WHERE p.user_id = u.id 
          AND p.season = ap.season 
          AND p.submitted = TRUE
          AND p.show_on_leaderboard = TRUE
      )
    GROUP BY u.id, u.display_name, ap.season, lsp.status, lsp.is_matched
    HAVING COUNT(ap.id) > 0
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
FROM combined_picks
ORDER BY season DESC, total_points DESC, total_wins DESC;

-- Step 4: Grant appropriate permissions
GRANT SELECT ON public.weekly_leaderboard TO anon, authenticated;
GRANT SELECT ON public.season_leaderboard TO anon, authenticated;

-- Step 5: Create helpful indexes for performance
CREATE INDEX IF NOT EXISTS idx_picks_leaderboard_weekly 
ON picks(week, season, user_id, submitted, show_on_leaderboard, points_earned) 
WHERE submitted = true AND show_on_leaderboard = true;

CREATE INDEX IF NOT EXISTS idx_picks_leaderboard_season
ON picks(season, user_id, submitted, show_on_leaderboard, points_earned) 
WHERE submitted = true AND show_on_leaderboard = true;

CREATE INDEX IF NOT EXISTS idx_anonymous_picks_leaderboard
ON anonymous_picks(week, season, assigned_user_id, show_on_leaderboard)
WHERE show_on_leaderboard = true;

-- Step 6: Log the migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 131d completed successfully';
    RAISE NOTICE '🔧 Fixed anonymous picks to use stored points_earned values instead of manual calculation';
    RAISE NOTICE '✓ Weekly leaderboard: Now uses SUM(ap.points_earned) for anonymous picks';
    RAISE NOTICE '✓ Season leaderboard: Now uses SUM(ap.points_earned) for anonymous picks';
    RAISE NOTICE '✓ This should resolve 5-1-0 records showing incorrect 60 points';
    RAISE NOTICE '✓ Points calculation now matches the stored values in anonymous_picks.points_earned';
END;
$$;