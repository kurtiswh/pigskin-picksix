-- Migration 131b: Fix Leaderboard Tables to Views with Proper Filtering
-- 
-- PURPOSE: Convert weekly_leaderboard and season_leaderboard from tables to views
-- that properly filter by submitted=true and show_on_leaderboard=true

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 131b: Converting leaderboard tables to filtered views';
    RAISE NOTICE '===============================================================';
END;
$$;

-- Step 1: Drop existing TABLES (not views)
DROP TABLE IF EXISTS public.weekly_leaderboard CASCADE;
DROP TABLE IF EXISTS public.season_leaderboard CASCADE;

-- Step 2: Also drop any existing views with these names just in case
DROP VIEW IF EXISTS public.weekly_leaderboard CASCADE;
DROP VIEW IF EXISTS public.season_leaderboard CASCADE;

-- Step 3: Create weekly_leaderboard as a VIEW with proper filtering
CREATE VIEW public.weekly_leaderboard AS
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
    RANK() OVER (PARTITION BY p.week, p.season ORDER BY COALESCE(SUM(p.points_earned), 0) DESC, COUNT(CASE WHEN p.result = 'win' THEN 1 END) DESC) as weekly_rank,
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

-- Anonymous picks for users who don't have authenticated picks for this week
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
    COALESCE(SUM(
        CASE
            WHEN g.status = 'completed' THEN
                CASE 
                    WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                          (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN
                        CASE WHEN ap.is_lock THEN 20 ELSE 10 END
                    WHEN ABS((g.home_score + g.spread) - g.away_score) < 0.5 THEN 0
                    ELSE 0
                END
            ELSE 0
        END
    ), 0) as total_points,
    RANK() OVER (PARTITION BY ap.week, ap.season ORDER BY 
        COALESCE(SUM(
            CASE
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN
                            CASE WHEN ap.is_lock THEN 20 ELSE 10 END
                        WHEN ABS((g.home_score + g.spread) - g.away_score) < 0.5 THEN 0
                        ELSE 0
                    END
                ELSE 0
            END
        ), 0) DESC,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) DESC
    ) as weekly_rank,
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
HAVING COUNT(ap.id) > 0;

-- Step 4: Create season_leaderboard as a VIEW with proper filtering
CREATE VIEW public.season_leaderboard AS
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
    RANK() OVER (PARTITION BY p.season ORDER BY COALESCE(SUM(p.points_earned), 0) DESC, COUNT(CASE WHEN p.result = 'win' THEN 1 END) DESC) as season_rank,
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

-- Anonymous picks for users who don't have authenticated picks for this season
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
    COALESCE(SUM(
        CASE
            WHEN g.status = 'completed' THEN
                CASE 
                    WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                          (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN
                        CASE WHEN ap.is_lock THEN 20 ELSE 10 END
                    WHEN ABS((g.home_score + g.spread) - g.away_score) < 0.5 THEN 0
                    ELSE 0
                END
            ELSE 0
        END
    ), 0) as total_points,
    RANK() OVER (PARTITION BY ap.season ORDER BY 
        COALESCE(SUM(
            CASE
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN
                            CASE WHEN ap.is_lock THEN 20 ELSE 10 END
                        WHEN ABS((g.home_score + g.spread) - g.away_score) < 0.5 THEN 0
                        ELSE 0
                    END
                ELSE 0
            END
        ), 0) DESC,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) DESC
    ) as season_rank,
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
HAVING COUNT(ap.id) > 0;

-- Step 5: Grant appropriate permissions
GRANT SELECT ON public.weekly_leaderboard TO anon, authenticated;
GRANT SELECT ON public.season_leaderboard TO anon, authenticated;

-- Step 6: Log the migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 131b completed successfully';
    RAISE NOTICE '📊 Converted leaderboard TABLES to VIEWS with proper filtering';
    RAISE NOTICE '✓ weekly_leaderboard now only shows users with submitted=true picks';
    RAISE NOTICE '✓ season_leaderboard now only shows users with submitted=true picks';
    RAISE NOTICE '✓ Both views now properly handle authenticated and anonymous picks';
    RAISE NOTICE '✓ No more 0-pick entries on leaderboards';
END;
$$;