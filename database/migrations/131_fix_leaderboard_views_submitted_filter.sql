-- Migration 131: Fix Leaderboard Views to Only Show Submitted Picks
-- 
-- PURPOSE: Update the weekly_leaderboard and season_leaderboard views to properly filter
-- by submitted=true and show_on_leaderboard=true, and only show users who have actual picks

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 131: Fix leaderboard views to only show submitted picks';
    RAISE NOTICE '===============================================================';
END;
$$;

-- Step 1: Drop and recreate weekly_leaderboard view
DROP VIEW IF EXISTS public.weekly_leaderboard;

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
JOIN public.picks p ON u.id = p.user_id
LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
WHERE p.submitted = TRUE  -- Only count submitted picks
  AND p.show_on_leaderboard = TRUE  -- Only count picks that should show on leaderboard
GROUP BY u.id, u.display_name, p.week, p.season, lsp.status, lsp.is_matched
HAVING COUNT(p.id) > 0;  -- Only show users who actually have picks

-- Step 2: Drop and recreate season_leaderboard view
DROP VIEW IF EXISTS public.season_leaderboard;

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
JOIN public.picks p ON u.id = p.user_id
LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
WHERE p.submitted = TRUE  -- Only count submitted picks
  AND p.show_on_leaderboard = TRUE  -- Only count picks that should show on leaderboard
GROUP BY u.id, u.display_name, p.season, lsp.status, lsp.is_matched
HAVING COUNT(p.id) > 0;  -- Only show users who actually have picks

-- Step 3: Create a combined weekly leaderboard view that includes anonymous picks
DROP VIEW IF EXISTS public.weekly_leaderboard_combined;

CREATE VIEW public.weekly_leaderboard_combined AS
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
    COALESCE(SUM(p.points_earned), 0) as total_points,
    CASE 
        WHEN lsp.status = 'Paid' THEN 'Paid'
        WHEN lsp.status = 'Pending' THEN 'Pending'
        ELSE 'NotPaid'
    END as payment_status,
    (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified,
    'authenticated' as pick_source
FROM public.users u
JOIN public.picks p ON u.id = p.user_id
LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
WHERE p.submitted = TRUE 
  AND p.show_on_leaderboard = TRUE
  -- Exclude users who have anonymous picks for the same week/season to avoid duplicates
  AND NOT EXISTS (
    SELECT 1 FROM public.anonymous_picks ap 
    WHERE ap.assigned_user_id = u.id 
      AND ap.week = p.week 
      AND ap.season = p.season 
      AND ap.show_on_leaderboard = TRUE
  )
GROUP BY u.id, u.display_name, p.week, p.season, lsp.status, lsp.is_matched
HAVING COUNT(p.id) > 0

UNION ALL

-- Anonymous picks (assigned to users)
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
    CASE 
        WHEN lsp.status = 'Paid' THEN 'Paid'
        WHEN lsp.status = 'Pending' THEN 'Pending'
        ELSE 'NotPaid'
    END as payment_status,
    (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified,
    'anonymous' as pick_source
FROM public.users u
JOIN public.anonymous_picks ap ON u.id = ap.assigned_user_id
JOIN public.games g ON ap.game_id = g.id
LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = ap.season
WHERE ap.show_on_leaderboard = TRUE
GROUP BY u.id, u.display_name, ap.week, ap.season, lsp.status, lsp.is_matched
HAVING COUNT(ap.id) > 0;

-- Step 4: Add ranking to the combined view
DROP VIEW IF EXISTS public.weekly_leaderboard_ranked;

CREATE VIEW public.weekly_leaderboard_ranked AS
SELECT 
    *,
    RANK() OVER (PARTITION BY week, season ORDER BY total_points DESC, wins DESC) as weekly_rank
FROM public.weekly_leaderboard_combined;

-- Step 5: Create a combined season leaderboard view that includes anonymous picks  
DROP VIEW IF EXISTS public.season_leaderboard_combined;

CREATE VIEW public.season_leaderboard_combined AS
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
JOIN public.picks p ON u.id = p.user_id
LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
WHERE p.submitted = TRUE 
  AND p.show_on_leaderboard = TRUE
  -- Exclude users who have anonymous picks for the same season to avoid duplicates
  AND NOT EXISTS (
    SELECT 1 FROM public.anonymous_picks ap 
    WHERE ap.assigned_user_id = u.id 
      AND ap.season = p.season 
      AND ap.show_on_leaderboard = TRUE
  )
GROUP BY u.id, u.display_name, p.season, lsp.status, lsp.is_matched
HAVING COUNT(p.id) > 0

UNION ALL

-- Anonymous picks (assigned to users)
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
    CASE 
        WHEN lsp.status = 'Paid' THEN 'Paid'
        WHEN lsp.status = 'Pending' THEN 'Pending'
        ELSE 'NotPaid'
    END as payment_status,
    (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified,
    'anonymous' as pick_source
FROM public.users u
JOIN public.anonymous_picks ap ON u.id = ap.assigned_user_id
JOIN public.games g ON ap.game_id = g.id
LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = ap.season
WHERE ap.show_on_leaderboard = TRUE
GROUP BY u.id, u.display_name, ap.season, lsp.status, lsp.is_matched
HAVING COUNT(ap.id) > 0;

-- Step 6: Add ranking to the combined season view
DROP VIEW IF EXISTS public.season_leaderboard_ranked;

CREATE VIEW public.season_leaderboard_ranked AS
SELECT 
    *,
    RANK() OVER (PARTITION BY season ORDER BY total_points DESC, total_wins DESC) as season_rank
FROM public.season_leaderboard_combined;

-- Step 7: Log the migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 131 completed successfully';
    RAISE NOTICE '📊 Leaderboard views now properly filter by submitted=true and show_on_leaderboard=true';
    RAISE NOTICE '👥 Views now only show users who actually have picks (no more 0-pick entries)';
    RAISE NOTICE '🔗 Added combined views that include both authenticated and anonymous picks';
    RAISE NOTICE '📈 Use weekly_leaderboard_ranked and season_leaderboard_ranked for best results';
END;
$$;