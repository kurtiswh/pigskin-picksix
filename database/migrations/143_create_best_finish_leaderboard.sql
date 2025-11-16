-- Migration 143: Create Best Finish Leaderboard
--
-- PURPOSE: Track the "4th quarter" competition for weeks 11-14
--
-- COMPETITION RULES:
-- 1. Total points over final 4 weeks (weeks 11-14)
-- 2. Tiebreaker #1: Best overall win % during final 4 weeks
-- 3. Tiebreaker #2: Best lock pick win % during final 4 weeks
-- 4. Special: If >6 picks needed due to cancelled game, use worst 6-game score

DO $$
BEGIN
    RAISE NOTICE '🏆 Migration 143: Creating Best Finish Leaderboard';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Tracks final 4 weeks (11-14) for 4th quarter championship';
    RAISE NOTICE '';
END;
$$;

-- Step 1: Add flag to mark Best Finish eligible weeks
ALTER TABLE public.week_settings
ADD COLUMN IF NOT EXISTS best_finish_eligible BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.week_settings.best_finish_eligible IS
'TRUE for weeks 11-14 that count toward Best Finish championship';

-- Mark weeks 11-14 as Best Finish eligible for 2025
UPDATE public.week_settings
SET best_finish_eligible = TRUE
WHERE season = 2025
  AND week BETWEEN 11 AND 14;

-- Step 2: Create view for Best Finish leaderboard
CREATE OR REPLACE VIEW public.best_finish_leaderboard AS
WITH best_finish_picks AS (
    -- Get all picks from Best Finish weeks (both authenticated and anonymous)
    SELECT
        p.user_id,
        p.week,
        p.season,
        p.selected_team,
        p.is_lock,
        p.result,
        p.points_earned
    FROM public.picks p
    JOIN public.week_settings ws ON p.week = ws.week AND p.season = ws.season
    WHERE ws.best_finish_eligible = TRUE
      AND p.submitted_at IS NOT NULL

    UNION ALL

    SELECT
        ap.assigned_user_id as user_id,
        ap.week,
        ap.season,
        ap.selected_team,
        ap.is_lock,
        ap.result,
        ap.points_earned
    FROM public.anonymous_picks ap
    JOIN public.week_settings ws ON ap.week = ws.week AND ap.season = ws.season
    WHERE ws.best_finish_eligible = TRUE
      AND ap.assigned_user_id IS NOT NULL
      AND ap.show_on_leaderboard = TRUE
      AND ap.validation_status IN ('auto_validated', 'manually_validated')
),
user_weekly_summary AS (
    -- Summarize each user's performance per week
    SELECT
        user_id,
        season,
        week,
        COUNT(*) as picks_count,
        SUM(points_earned) as week_points,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as week_wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as week_losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as week_pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock THEN 1 END) as week_lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock THEN 1 END) as week_lock_losses,
        COUNT(CASE WHEN result = 'push' AND is_lock THEN 1 END) as week_lock_pushes
    FROM best_finish_picks
    GROUP BY user_id, season, week
),
user_best_finish_totals AS (
    -- Calculate totals across all Best Finish weeks
    SELECT
        user_id,
        season,
        ARRAY_AGG(DISTINCT week ORDER BY week) as weeks_included,
        SUM(week_points) as total_points,
        SUM(week_wins) as total_wins,
        SUM(week_losses) as total_losses,
        SUM(week_pushes) as total_pushes,
        SUM(week_lock_wins) as lock_wins,
        SUM(week_lock_losses) as lock_losses,
        SUM(week_lock_pushes) as lock_pushes,
        SUM(picks_count) as total_picks,
        MIN(week_points) as worst_week_score,
        -- Win percentages for tiebreaking
        CASE
            WHEN SUM(week_wins + week_losses) > 0
            THEN ROUND(SUM(week_wins)::numeric / SUM(week_wins + week_losses), 3)
            ELSE 0
        END as win_percentage,
        CASE
            WHEN SUM(week_lock_wins + week_lock_losses) > 0
            THEN ROUND(SUM(week_lock_wins)::numeric / SUM(week_lock_wins + week_lock_losses), 3)
            ELSE 0
        END as lock_win_percentage
    FROM user_weekly_summary
    GROUP BY user_id, season
)
SELECT
    u.id as user_id,
    u.display_name,
    u.leaguesafe_email,
    COALESCE(lsp.status, 'not_paid') as payment_status,
    ubft.season,
    ubft.weeks_included,
    ubft.total_points,
    ubft.total_wins,
    ubft.total_losses,
    ubft.total_pushes,
    ubft.lock_wins,
    ubft.lock_losses,
    ubft.lock_pushes,
    ubft.total_picks,
    ubft.win_percentage,
    ubft.lock_win_percentage,
    ubft.worst_week_score,
    -- Overall record string (W-L-P format)
    CONCAT(ubft.total_wins, '-', ubft.total_losses, '-', ubft.total_pushes) as record,
    -- Lock record string
    CONCAT(ubft.lock_wins, '-', ubft.lock_losses, '-', ubft.lock_pushes) as lock_record,
    -- Ranking with tiebreakers: points DESC, win% DESC, lock win% DESC
    DENSE_RANK() OVER (
        PARTITION BY ubft.season
        ORDER BY
            ubft.total_points DESC,
            ubft.win_percentage DESC,
            ubft.lock_win_percentage DESC,
            u.display_name ASC  -- Final tiebreaker: alphabetical
    ) as rank
FROM public.users u
JOIN user_best_finish_totals ubft ON u.id = ubft.user_id
LEFT JOIN public.leaguesafe_payments lsp ON
    u.id = lsp.user_id AND ubft.season = lsp.season
WHERE ubft.total_points > 0  -- Only users with picks
ORDER BY ubft.season DESC, rank ASC;

-- Grant permissions
GRANT SELECT ON public.best_finish_leaderboard TO authenticated, anon;

-- Add helpful comment
COMMENT ON VIEW public.best_finish_leaderboard IS
'Best Finish (4th quarter) championship leaderboard. Tracks total points, record, and lock performance over weeks 11-14. Tiebreakers: 1) Total points, 2) Win %, 3) Lock win %.';

-- Step 3: Create function to get detailed week-by-week breakdown
CREATE OR REPLACE FUNCTION get_best_finish_details(
    user_id_param UUID,
    season_param INTEGER
)
RETURNS TABLE(
    week INTEGER,
    picks_count INTEGER,
    points INTEGER,
    wins INTEGER,
    losses INTEGER,
    pushes INTEGER,
    lock_wins INTEGER,
    lock_losses INTEGER,
    lock_pushes INTEGER,
    record TEXT,
    lock_record TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH best_finish_picks AS (
        -- Get all picks from Best Finish weeks
        SELECT
            p.week,
            p.selected_team,
            p.is_lock,
            p.result,
            p.points_earned
        FROM public.picks p
        JOIN public.week_settings ws ON p.week = ws.week AND p.season = ws.season
        WHERE p.user_id = user_id_param
          AND p.season = season_param
          AND ws.best_finish_eligible = TRUE
          AND p.submitted_at IS NOT NULL

        UNION ALL

        SELECT
            ap.week,
            ap.selected_team,
            ap.is_lock,
            ap.result,
            ap.points_earned
        FROM public.anonymous_picks ap
        JOIN public.week_settings ws ON ap.week = ws.week AND ap.season = ws.season
        WHERE ap.assigned_user_id = user_id_param
          AND ap.season = season_param
          AND ws.best_finish_eligible = TRUE
          AND ap.show_on_leaderboard = TRUE
          AND ap.validation_status IN ('auto_validated', 'manually_validated')
    )
    SELECT
        bfp.week,
        COUNT(*)::INTEGER as picks_count,
        SUM(bfp.points_earned)::INTEGER as points,
        COUNT(CASE WHEN bfp.result = 'win' THEN 1 END)::INTEGER as wins,
        COUNT(CASE WHEN bfp.result = 'loss' THEN 1 END)::INTEGER as losses,
        COUNT(CASE WHEN bfp.result = 'push' THEN 1 END)::INTEGER as pushes,
        COUNT(CASE WHEN bfp.result = 'win' AND bfp.is_lock THEN 1 END)::INTEGER as lock_wins,
        COUNT(CASE WHEN bfp.result = 'loss' AND bfp.is_lock THEN 1 END)::INTEGER as lock_losses,
        COUNT(CASE WHEN bfp.result = 'push' AND bfp.is_lock THEN 1 END)::INTEGER as lock_pushes,
        CONCAT(
            COUNT(CASE WHEN bfp.result = 'win' THEN 1 END),
            '-',
            COUNT(CASE WHEN bfp.result = 'loss' THEN 1 END),
            '-',
            COUNT(CASE WHEN bfp.result = 'push' THEN 1 END)
        ) as record,
        CONCAT(
            COUNT(CASE WHEN bfp.result = 'win' AND bfp.is_lock THEN 1 END),
            '-',
            COUNT(CASE WHEN bfp.result = 'loss' AND bfp.is_lock THEN 1 END),
            '-',
            COUNT(CASE WHEN bfp.result = 'push' AND bfp.is_lock THEN 1 END)
        ) as lock_record
    FROM best_finish_picks bfp
    GROUP BY bfp.week
    ORDER BY bfp.week;
END;
$$;

GRANT EXECUTE ON FUNCTION get_best_finish_details(UUID, INTEGER) TO authenticated, anon;

COMMENT ON FUNCTION get_best_finish_details(UUID, INTEGER) IS
'Returns week-by-week breakdown for a user in the Best Finish competition';

-- Verification and summary
DO $$
DECLARE
    view_count INTEGER;
    eligible_weeks INTEGER;
    test_user_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 143 COMPLETED!';
    RAISE NOTICE '';

    -- Check view exists
    SELECT COUNT(*) INTO view_count
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'best_finish_leaderboard';

    IF view_count = 1 THEN
        RAISE NOTICE '✅ best_finish_leaderboard view created';
    ELSE
        RAISE WARNING '⚠️  View not found - check for errors';
    END IF;

    -- Check eligible weeks
    SELECT COUNT(*) INTO eligible_weeks
    FROM public.week_settings
    WHERE best_finish_eligible = TRUE;

    RAISE NOTICE '📅 % weeks marked as Best Finish eligible', eligible_weeks;

    -- Test query
    SELECT COUNT(DISTINCT user_id) INTO test_user_count
    FROM public.best_finish_leaderboard
    WHERE season = 2025;

    RAISE NOTICE '👥 % users currently on Best Finish leaderboard', test_user_count;

    RAISE NOTICE '';
    RAISE NOTICE '🏆 BEST FINISH COMPETITION SETUP:';
    RAISE NOTICE '• Weeks: 11-14 (4th quarter championship)';
    RAISE NOTICE '• Tiebreaker #1: Total points';
    RAISE NOTICE '• Tiebreaker #2: Win percentage';
    RAISE NOTICE '• Tiebreaker #3: Lock win percentage';
    RAISE NOTICE '';
    RAISE NOTICE '📊 USAGE:';
    RAISE NOTICE '• Query view: SELECT * FROM best_finish_leaderboard WHERE season = 2025;';
    RAISE NOTICE '• Get details: SELECT * FROM get_best_finish_details(user_id, 2025);';
    RAISE NOTICE '';
END;
$$;
