-- Migration 148: Add lock_pushes column to season_leaderboard view
--
-- PURPOSE: Track lock pushes in season leaderboard for consistency with weekly leaderboard
-- CHANGES: Add lock_pushes column to season_leaderboard view

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 148: Adding lock_pushes to season_leaderboard view';
    RAISE NOTICE '================================================================';
END;
$$;

-- Drop and recreate the view with lock_pushes
DROP VIEW IF EXISTS public.season_leaderboard CASCADE;

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
      AND NOT EXISTS (
        SELECT 1 FROM public.picks p
        WHERE p.user_id = u.id
          AND p.week = ap.week
          AND p.season = ap.season
          AND p.submitted = TRUE
          AND p.show_on_leaderboard = TRUE
      )
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
        COUNT(CASE WHEN result = 'push' AND is_lock THEN 1 END) as lock_pushes,  -- NEW COLUMN
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
    lock_pushes,  -- NEW COLUMN
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

GRANT SELECT ON public.season_leaderboard TO anon, authenticated;

COMMENT ON VIEW public.season_leaderboard IS
    'Season leaderboard with lock_pushes column. Filtered to only show paid users.';

-- Verify the change
DO $$
BEGIN
    RAISE NOTICE '✅ Migration complete!';
    RAISE NOTICE '';
    RAISE NOTICE 'To verify, run:';
    RAISE NOTICE 'SELECT display_name, lock_wins, lock_losses, lock_pushes, total_points';
    RAISE NOTICE 'FROM season_leaderboard';
    RAISE NOTICE 'WHERE season = 2024';
    RAISE NOTICE 'ORDER BY season_rank';
    RAISE NOTICE 'LIMIT 5;';
END $$;
