-- Migration 133: Add Payment Filtering to Leaderboard Views
-- 
-- PURPOSE: Only show paid users on public leaderboards
-- CHANGES: 
--   1. Filter weekly_leaderboard to only show users with payment status = 'Paid'
--   2. Filter season_leaderboard to only show users with payment status = 'Paid'
--   3. Unpaid users will be tracked in Pick Management admin section instead
--
-- BENEFIT: When you mark a user as "Paid" in leaguesafe_payments, they automatically appear on leaderboards

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 133: Adding payment filtering to leaderboard views';
    RAISE NOTICE '==================================================================';
    RAISE NOTICE 'CHANGE: Only paid users will appear on public leaderboards';
    RAISE NOTICE 'ADMIN: Unpaid users with picks will be visible in Pick Management';
END;
$$;

-- Step 1: Drop existing views
DROP VIEW IF EXISTS public.weekly_leaderboard CASCADE;
DROP VIEW IF EXISTS public.season_leaderboard CASCADE;

-- Step 2: Create weekly_leaderboard with payment filtering
CREATE VIEW public.weekly_leaderboard AS
WITH combined_picks AS (
    -- Authenticated picks (ONLY PAID USERS)
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
        lsp.status as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified,
        'authenticated' as pick_source
    FROM public.users u
    INNER JOIN public.picks p ON u.id = p.user_id
    INNER JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
    WHERE p.submitted = TRUE
      AND p.show_on_leaderboard = TRUE
      AND lsp.status = 'Paid'  -- FILTER: Only show paid users
    GROUP BY u.id, u.display_name, p.week, p.season, lsp.status, lsp.is_matched
    HAVING COUNT(p.id) > 0

    UNION ALL

    -- Anonymous picks (ONLY PAID USERS)
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
        COALESCE(SUM(CASE WHEN g.status = 'completed' THEN ap.points_earned ELSE 0 END), 0) as total_points,
        lsp.status as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified,
        'anonymous' as pick_source
    FROM public.users u
    INNER JOIN public.anonymous_picks ap ON u.id = ap.assigned_user_id
    INNER JOIN public.games g ON ap.game_id = g.id
    INNER JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = ap.season
    WHERE ap.show_on_leaderboard = TRUE
      AND lsp.status = 'Paid'  -- FILTER: Only show paid users
      AND NOT EXISTS (
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
    RANK() OVER (
        PARTITION BY week, season 
        ORDER BY total_points DESC, wins DESC, display_name ASC
    ) as weekly_rank,
    payment_status,
    is_verified,
    pick_source
FROM combined_picks
ORDER BY week DESC, season DESC, total_points DESC, wins DESC;

-- Step 3: Create season_leaderboard with payment filtering
CREATE VIEW public.season_leaderboard AS
WITH all_picks AS (
    -- Authenticated picks (ONLY PAID USERS)
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
    INNER JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
    WHERE p.submitted = TRUE 
      AND p.show_on_leaderboard = TRUE
      AND lsp.status = 'Paid'  -- FILTER: Only show paid users

    UNION ALL

    -- Anonymous picks (ONLY PAID USERS)
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
            ELSE NULL::pick_result
        END as result,
        ap.is_lock,
        CASE WHEN g.status = 'completed' THEN ap.points_earned ELSE 0 END as points_earned,
        lsp.status as payment_status,
        lsp.is_matched,
        'anonymous' as pick_source
    FROM public.users u
    INNER JOIN public.anonymous_picks ap ON u.id = ap.assigned_user_id
    INNER JOIN public.games g ON ap.game_id = g.id
    INNER JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = ap.season
    WHERE ap.show_on_leaderboard = TRUE
      AND lsp.status = 'Paid'  -- FILTER: Only show paid users
),
combined_user_stats AS (
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
        MAX(payment_status) as payment_status,  -- Will always be 'Paid' due to filtering
        MAX(CASE WHEN payment_status = 'Paid' AND is_matched = true THEN 1 ELSE 0 END) = 1 as is_verified,
        CASE 
            WHEN COUNT(DISTINCT pick_source) > 1 THEN 'mixed'
            ELSE MAX(pick_source)
        END as pick_source
    FROM all_picks
    WHERE result IS NOT NULL
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

-- Step 5: Create a helpful comment
COMMENT ON VIEW public.weekly_leaderboard IS 
'Weekly leaderboard showing ONLY PAID users. Unpaid users with submitted picks are tracked in Pick Management admin section.';

COMMENT ON VIEW public.season_leaderboard IS 
'Season leaderboard showing ONLY PAID users. Unpaid users with submitted picks are tracked in Pick Management admin section.';

-- Step 6: Log the migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 133 completed successfully';
    RAISE NOTICE '🔧 Leaderboards now filter to show ONLY PAID users';
    RAISE NOTICE '✓ Mark user as Paid in leaguesafe_payments → They appear on leaderboards';
    RAISE NOTICE '✓ Mark user as NotPaid → They disappear from leaderboards';
    RAISE NOTICE '✓ Unpaid users with picks will be visible in Pick Management admin section';
    RAISE NOTICE '📊 Payment filtering is automatic - no manual management needed!';
END;
$$;