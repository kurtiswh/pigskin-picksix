-- Migration 260: Best Finish counts picks the way the season leaderboard does
--
-- WHY: best_finish_leaderboard and get_best_finish_details used older, looser
-- pick rules than season_leaderboard. In 2026 that:
--   * double-counted a player with both an authenticated and an anonymous
--     sheet for the same week (M TURNER, week 10: 116 shown, 68 correct);
--   * listed 7 players with no 2026 payment after the grace period, shown to
--     admins as "payment pending*" though none is on the season board;
--   * ignored disqualified picks, hidden/unsubmitted sheets, merged tombstones.
--
-- The pick rules below are copied from season_leaderboard (same payment/grace
-- gate, merged filter, submitted + show_on_leaderboard + not disqualified,
-- anonymous sheet dropped when an authenticated one exists for the week,
-- anonymous results derived from the game) and restricted to
-- week_settings.best_finish_eligible. Output columns are unchanged.
-- Keep the two pick CTEs in sync with each other and with season_leaderboard.

CREATE OR REPLACE VIEW public.best_finish_leaderboard
WITH (security_invoker = false) AS
WITH best_finish_picks AS (
  SELECT p.user_id, p.week, p.season, p.selected_team, p.is_lock, p.result, p.points_earned
  FROM public.picks p
  JOIN public.users u ON u.id = p.user_id
  JOIN public.week_settings ws ON ws.week = p.week AND ws.season = p.season AND ws.best_finish_eligible
  LEFT JOIN public.leaguesafe_payments lsp ON lsp.user_id = u.id AND lsp.season = p.season
  WHERE u.email NOT LIKE '%\_merged\_%'
    AND p.submitted AND p.show_on_leaderboard AND NOT p.disqualified
    AND (lsp.status = 'Paid' OR (SELECT COALESCE(max(w.week),0) FROM public.week_settings w WHERE w.season = p.season AND w.games_selected)
                                <= (SELECT grace_period_weeks FROM public.app_settings LIMIT 1))
  UNION ALL
  SELECT ap.assigned_user_id, ap.week, ap.season, ap.selected_team, ap.is_lock,
    CASE
      WHEN g.status = 'completed' AND ((ap.selected_team = g.home_team AND g.home_score + g.spread > g.away_score)
                                    OR (ap.selected_team = g.away_team AND g.away_score - g.spread > g.home_score)) THEN 'win'::pick_result
      WHEN g.status = 'completed' AND abs(g.home_score + g.spread - g.away_score) < 0.5 THEN 'push'::pick_result
      WHEN g.status = 'completed' THEN 'loss'::pick_result
    END,
    CASE WHEN g.status = 'completed' THEN ap.points_earned ELSE 0 END
  FROM public.anonymous_picks ap
  JOIN public.users u ON u.id = ap.assigned_user_id
  JOIN public.games g ON g.id = ap.game_id
  JOIN public.week_settings ws ON ws.week = ap.week AND ws.season = ap.season AND ws.best_finish_eligible
  LEFT JOIN public.leaguesafe_payments lsp ON lsp.user_id = u.id AND lsp.season = ap.season
  WHERE u.email NOT LIKE '%\_merged\_%'
    AND ap.show_on_leaderboard AND NOT ap.disqualified
    AND (lsp.status = 'Paid' OR (SELECT COALESCE(max(w.week),0) FROM public.week_settings w WHERE w.season = ap.season AND w.games_selected)
                                <= (SELECT grace_period_weeks FROM public.app_settings LIMIT 1))
    AND NOT EXISTS (SELECT 1 FROM public.picks p2 WHERE p2.user_id = u.id AND p2.week = ap.week AND p2.season = ap.season
                      AND p2.submitted AND p2.show_on_leaderboard)
  ),
  user_weekly_summary AS (
    SELECT user_id, season, week,
      count(*) AS picks_count,
      sum(points_earned) AS week_points,
      count(CASE WHEN result = 'win'::pick_result THEN 1 END) AS week_wins,
      count(CASE WHEN result = 'loss'::pick_result THEN 1 END) AS week_losses,
      count(CASE WHEN result = 'push'::pick_result THEN 1 END) AS week_pushes,
      count(CASE WHEN result = 'win'::pick_result AND is_lock THEN 1 END) AS week_lock_wins,
      count(CASE WHEN result = 'loss'::pick_result AND is_lock THEN 1 END) AS week_lock_losses,
      count(CASE WHEN result = 'push'::pick_result AND is_lock THEN 1 END) AS week_lock_pushes
    FROM best_finish_picks
    WHERE result IS NOT NULL
    GROUP BY user_id, season, week
  ),
  user_best_finish_totals AS (
    SELECT user_id, season,
      array_agg(DISTINCT week ORDER BY week) AS weeks_included,
      sum(week_points) AS total_points,
      sum(week_wins) AS total_wins,
      sum(week_losses) AS total_losses,
      sum(week_pushes) AS total_pushes,
      sum(week_lock_wins) AS lock_wins,
      sum(week_lock_losses) AS lock_losses,
      sum(week_lock_pushes) AS lock_pushes,
      sum(picks_count) AS total_picks,
      min(week_points) AS worst_week_score,
      CASE WHEN sum(week_wins + week_losses) > 0::numeric
        THEN round(sum(week_wins) / sum(week_wins + week_losses), 3) ELSE 0::numeric END AS win_percentage,
      CASE WHEN sum(week_lock_wins + week_lock_losses) > 0::numeric
        THEN round(sum(week_lock_wins) / sum(week_lock_wins + week_lock_losses), 3) ELSE 0::numeric END AS lock_win_percentage
    FROM user_weekly_summary
    GROUP BY user_id, season
  )
SELECT u.id AS user_id,
  u.display_name,
  u.leaguesafe_email,
  COALESCE(lsp.status, 'not_paid'::text) AS payment_status,
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
  concat(ubft.total_wins, '-', ubft.total_losses, '-', ubft.total_pushes) AS record,
  concat(ubft.lock_wins, '-', ubft.lock_losses, '-', ubft.lock_pushes) AS lock_record,
  dense_rank() OVER (PARTITION BY ubft.season ORDER BY ubft.total_points DESC, ubft.win_percentage DESC, ubft.lock_win_percentage DESC, u.display_name) AS rank
FROM public.users u
JOIN user_best_finish_totals ubft ON u.id = ubft.user_id
LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND ubft.season = lsp.season
WHERE ubft.total_points > 0::numeric
ORDER BY ubft.season DESC, rank;

CREATE OR REPLACE FUNCTION public.get_best_finish_details(user_id_param uuid, season_param integer)
 RETURNS TABLE(week integer, picks_count integer, points integer, wins integer, losses integer, pushes integer, lock_wins integer, lock_losses integer, lock_pushes integer, record text, lock_record text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH best_finish_picks AS (
    SELECT p.user_id, p.week, p.season, p.selected_team, p.is_lock, p.result, p.points_earned
    FROM public.picks p
    JOIN public.users u ON u.id = p.user_id
    JOIN public.week_settings ws ON ws.week = p.week AND ws.season = p.season AND ws.best_finish_eligible
    LEFT JOIN public.leaguesafe_payments lsp ON lsp.user_id = u.id AND lsp.season = p.season
    WHERE p.user_id = user_id_param AND p.season = season_param
      AND u.email NOT LIKE '%\_merged\_%'
      AND p.submitted AND p.show_on_leaderboard AND NOT p.disqualified
      AND (lsp.status = 'Paid' OR (SELECT COALESCE(max(w.week),0) FROM public.week_settings w WHERE w.season = p.season AND w.games_selected)
                                  <= (SELECT grace_period_weeks FROM public.app_settings LIMIT 1))
    UNION ALL
    SELECT ap.assigned_user_id, ap.week, ap.season, ap.selected_team, ap.is_lock,
      CASE
        WHEN g.status = 'completed' AND ((ap.selected_team = g.home_team AND g.home_score + g.spread > g.away_score)
                                      OR (ap.selected_team = g.away_team AND g.away_score - g.spread > g.home_score)) THEN 'win'::pick_result
        WHEN g.status = 'completed' AND abs(g.home_score + g.spread - g.away_score) < 0.5 THEN 'push'::pick_result
        WHEN g.status = 'completed' THEN 'loss'::pick_result
      END,
      CASE WHEN g.status = 'completed' THEN ap.points_earned ELSE 0 END
    FROM public.anonymous_picks ap
    JOIN public.users u ON u.id = ap.assigned_user_id
    JOIN public.games g ON g.id = ap.game_id
    JOIN public.week_settings ws ON ws.week = ap.week AND ws.season = ap.season AND ws.best_finish_eligible
    LEFT JOIN public.leaguesafe_payments lsp ON lsp.user_id = u.id AND lsp.season = ap.season
    WHERE ap.assigned_user_id = user_id_param AND ap.season = season_param
      AND u.email NOT LIKE '%\_merged\_%'
      AND ap.show_on_leaderboard AND NOT ap.disqualified
      AND (lsp.status = 'Paid' OR (SELECT COALESCE(max(w.week),0) FROM public.week_settings w WHERE w.season = ap.season AND w.games_selected)
                                  <= (SELECT grace_period_weeks FROM public.app_settings LIMIT 1))
      AND NOT EXISTS (SELECT 1 FROM public.picks p2 WHERE p2.user_id = u.id AND p2.week = ap.week AND p2.season = ap.season
                        AND p2.submitted AND p2.show_on_leaderboard)
  )
  SELECT
    bfp.week,
    COUNT(*)::INTEGER,
    SUM(bfp.points_earned)::INTEGER,
    COUNT(CASE WHEN bfp.result = 'win' THEN 1 END)::INTEGER,
    COUNT(CASE WHEN bfp.result = 'loss' THEN 1 END)::INTEGER,
    COUNT(CASE WHEN bfp.result = 'push' THEN 1 END)::INTEGER,
    COUNT(CASE WHEN bfp.result = 'win' AND bfp.is_lock THEN 1 END)::INTEGER,
    COUNT(CASE WHEN bfp.result = 'loss' AND bfp.is_lock THEN 1 END)::INTEGER,
    COUNT(CASE WHEN bfp.result = 'push' AND bfp.is_lock THEN 1 END)::INTEGER,
    CONCAT(COUNT(CASE WHEN bfp.result = 'win' THEN 1 END), '-',
           COUNT(CASE WHEN bfp.result = 'loss' THEN 1 END), '-',
           COUNT(CASE WHEN bfp.result = 'push' THEN 1 END)),
    CONCAT(COUNT(CASE WHEN bfp.result = 'win' AND bfp.is_lock THEN 1 END), '-',
           COUNT(CASE WHEN bfp.result = 'loss' AND bfp.is_lock THEN 1 END), '-',
           COUNT(CASE WHEN bfp.result = 'push' AND bfp.is_lock THEN 1 END))
  FROM best_finish_picks bfp
  WHERE bfp.result IS NOT NULL
  GROUP BY bfp.week
  ORDER BY bfp.week;
END;
$function$;
