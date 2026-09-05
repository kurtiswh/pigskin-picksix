-- Migration 233: merged accounts on the leaderboard
--
-- Two players submitted anonymous picks whose auto-tie matched them to their
-- MERGED tombstone rather than their surviving account, because at the time
-- the tombstone still carried a clean leaguesafe_email (fixed in 227, but
-- these assignments predate it). So "Dan Kucab (Merged)" and "Cara Capra
-- (Merged)" appeared on the board holding their real scores, while the
-- accounts those people actually sign in as appeared nowhere.
--
-- Reassigns the picks to the surviving accounts, and adds a tombstone filter
-- to both leaderboard views so a stray assignment can never surface a
-- "(Merged)" row again.

-- ── move the picks to the accounts these people actually use ──────────────
UPDATE public.anonymous_picks ap
SET assigned_user_id = h.target_user_id
FROM public.user_merge_history h
JOIN public.users t ON t.id = h.source_user_id
WHERE ap.assigned_user_id = h.source_user_id
  AND t.email LIKE '%\_merged\_%'
  -- never create a second entry for a week the survivor already has
  AND NOT EXISTS (
    SELECT 1 FROM public.anonymous_picks x
    WHERE x.assigned_user_id = h.target_user_id
      AND x.week = ap.week AND x.season = ap.season
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.picks p
    WHERE p.user_id = h.target_user_id
      AND p.week = ap.week AND p.season = ap.season AND p.submitted
  );
CREATE OR REPLACE VIEW public.weekly_leaderboard AS
 WITH combined_picks AS (
         SELECT u.id AS user_id,
            u.display_name,
            p.week,
            p.season,
            count(p.id) AS picks_made,
            count(
                CASE
                    WHEN p.result = 'win'::pick_result THEN 1
                    ELSE NULL::integer
                END) AS wins,
            count(
                CASE
                    WHEN p.result = 'loss'::pick_result THEN 1
                    ELSE NULL::integer
                END) AS losses,
            count(
                CASE
                    WHEN p.result = 'push'::pick_result THEN 1
                    ELSE NULL::integer
                END) AS pushes,
            count(
                CASE
                    WHEN p.result = 'win'::pick_result AND p.is_lock THEN 1
                    ELSE NULL::integer
                END) AS lock_wins,
            count(
                CASE
                    WHEN p.result = 'loss'::pick_result AND p.is_lock THEN 1
                    ELSE NULL::integer
                END) AS lock_losses,
            count(
                CASE
                    WHEN p.result = 'push'::pick_result AND p.is_lock THEN 1
                    ELSE NULL::integer
                END) AS lock_pushes,
            COALESCE(sum(p.points_earned), 0::bigint) AS total_points,
            COALESCE(lsp.status, 'NotPaid'::text) AS payment_status,
            COALESCE(lsp.status = 'Paid'::text AND lsp.is_matched = true, false) AS is_verified,
            'authenticated'::text AS pick_source
           FROM users u
             JOIN picks p ON u.id = p.user_id
             LEFT JOIN leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
          WHERE u.email !~~ '%\_merged\_%'::text AND p.submitted = true AND p.show_on_leaderboard = true AND NOT p.disqualified AND (lsp.status = 'Paid'::text OR p.week <= (( SELECT app_settings.grace_period_weeks
                   FROM app_settings
                 LIMIT 1)))
          GROUP BY u.id, u.display_name, p.week, p.season, lsp.status, lsp.is_matched
         HAVING count(p.id) > 0
        UNION ALL
         SELECT u.id AS user_id,
            u.display_name,
            ap.week,
            ap.season,
            count(ap.id) AS picks_made,
            count(
                CASE
                    WHEN g.status = 'completed'::game_status AND (ap.selected_team = g.home_team AND (g.home_score::numeric + g.spread) > g.away_score::numeric OR ap.selected_team = g.away_team AND (g.away_score::numeric - g.spread) > g.home_score::numeric) THEN 1
                    ELSE NULL::integer
                END) AS wins,
            count(
                CASE
                    WHEN g.status = 'completed'::game_status AND NOT (ap.selected_team = g.home_team AND (g.home_score::numeric + g.spread) > g.away_score::numeric OR ap.selected_team = g.away_team AND (g.away_score::numeric - g.spread) > g.home_score::numeric) AND abs(g.home_score::numeric + g.spread - g.away_score::numeric) >= 0.5 THEN 1
                    ELSE NULL::integer
                END) AS losses,
            count(
                CASE
                    WHEN g.status = 'completed'::game_status AND abs(g.home_score::numeric + g.spread - g.away_score::numeric) < 0.5 THEN 1
                    ELSE NULL::integer
                END) AS pushes,
            count(
                CASE
                    WHEN g.status = 'completed'::game_status AND ap.is_lock AND (ap.selected_team = g.home_team AND (g.home_score::numeric + g.spread) > g.away_score::numeric OR ap.selected_team = g.away_team AND (g.away_score::numeric - g.spread) > g.home_score::numeric) THEN 1
                    ELSE NULL::integer
                END) AS lock_wins,
            count(
                CASE
                    WHEN g.status = 'completed'::game_status AND ap.is_lock AND NOT (ap.selected_team = g.home_team AND (g.home_score::numeric + g.spread) > g.away_score::numeric OR ap.selected_team = g.away_team AND (g.away_score::numeric - g.spread) > g.home_score::numeric) AND abs(g.home_score::numeric + g.spread - g.away_score::numeric) >= 0.5 THEN 1
                    ELSE NULL::integer
                END) AS lock_losses,
            count(
                CASE
                    WHEN g.status = 'completed'::game_status AND ap.is_lock AND abs(g.home_score::numeric + g.spread - g.away_score::numeric) < 0.5 THEN 1
                    ELSE NULL::integer
                END) AS lock_pushes,
            COALESCE(sum(
                CASE
                    WHEN g.status = 'completed'::game_status THEN ap.points_earned
                    ELSE 0
                END), 0::bigint) AS total_points,
            COALESCE(lsp.status, 'NotPaid'::text) AS payment_status,
            COALESCE(lsp.status = 'Paid'::text AND lsp.is_matched = true, false) AS is_verified,
            'anonymous'::text AS pick_source
           FROM users u
             JOIN anonymous_picks ap ON u.id = ap.assigned_user_id
             JOIN games g ON ap.game_id = g.id
             LEFT JOIN leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = ap.season
          WHERE u.email !~~ '%\_merged\_%'::text AND ap.show_on_leaderboard = true AND NOT ap.disqualified AND (lsp.status = 'Paid'::text OR ap.week <= (( SELECT app_settings.grace_period_weeks
                   FROM app_settings
                 LIMIT 1))) AND NOT (EXISTS ( SELECT 1
                   FROM picks p
                  WHERE p.user_id = u.id AND p.week = ap.week AND p.season = ap.season AND p.submitted = true AND p.show_on_leaderboard = true))
          GROUP BY u.id, u.display_name, ap.week, ap.season, lsp.status, lsp.is_matched
         HAVING count(ap.id) > 0
        )
 SELECT user_id,
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
    rank() OVER (PARTITION BY week, season ORDER BY total_points DESC, wins DESC, display_name) AS weekly_rank,
    payment_status,
    is_verified,
    pick_source
   FROM combined_picks
  ORDER BY week DESC, season DESC, total_points DESC, wins DESC;
;
CREATE OR REPLACE VIEW public.season_leaderboard AS
 WITH all_picks AS (
         SELECT u.id AS user_id,
            u.display_name,
            p.season,
            p.id AS pick_id,
            p.result,
            p.is_lock,
            p.points_earned,
            COALESCE(lsp.status, 'NotPaid'::text) AS payment_status,
            lsp.is_matched,
            'authenticated'::text AS pick_source
           FROM users u
             JOIN picks p ON u.id = p.user_id
             LEFT JOIN leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
          WHERE u.email !~~ '%\_merged\_%'::text AND p.submitted = true AND p.show_on_leaderboard = true AND NOT p.disqualified AND (lsp.status = 'Paid'::text OR (( SELECT COALESCE(max(ws.week), 0) AS "coalesce"
                   FROM week_settings ws
                  WHERE ws.season = p.season AND ws.games_selected)) <= (( SELECT app_settings.grace_period_weeks
                   FROM app_settings
                 LIMIT 1)))
        UNION ALL
         SELECT u.id AS user_id,
            u.display_name,
            ap.season,
            ap.id AS pick_id,
                CASE
                    WHEN g.status = 'completed'::game_status AND (ap.selected_team = g.home_team AND (g.home_score::numeric + g.spread) > g.away_score::numeric OR ap.selected_team = g.away_team AND (g.away_score::numeric - g.spread) > g.home_score::numeric) THEN 'win'::pick_result
                    WHEN g.status = 'completed'::game_status AND abs(g.home_score::numeric + g.spread - g.away_score::numeric) < 0.5 THEN 'push'::pick_result
                    WHEN g.status = 'completed'::game_status THEN 'loss'::pick_result
                    ELSE NULL::pick_result
                END AS result,
            ap.is_lock,
                CASE
                    WHEN g.status = 'completed'::game_status THEN ap.points_earned
                    ELSE 0
                END AS points_earned,
            COALESCE(lsp.status, 'NotPaid'::text) AS payment_status,
            lsp.is_matched,
            'anonymous'::text AS pick_source
           FROM users u
             JOIN anonymous_picks ap ON u.id = ap.assigned_user_id
             JOIN games g ON ap.game_id = g.id
             LEFT JOIN leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = ap.season
          WHERE u.email !~~ '%\_merged\_%'::text AND ap.show_on_leaderboard = true AND NOT ap.disqualified AND (lsp.status = 'Paid'::text OR (( SELECT COALESCE(max(ws.week), 0) AS "coalesce"
                   FROM week_settings ws
                  WHERE ws.season = ap.season AND ws.games_selected)) <= (( SELECT app_settings.grace_period_weeks
                   FROM app_settings
                 LIMIT 1))) AND NOT (EXISTS ( SELECT 1
                   FROM picks p
                  WHERE p.user_id = u.id AND p.week = ap.week AND p.season = ap.season AND p.submitted = true AND p.show_on_leaderboard = true))
        ), combined_user_stats AS (
         SELECT all_picks.user_id,
            all_picks.display_name,
            all_picks.season,
            count(all_picks.pick_id) AS total_picks,
            count(
                CASE
                    WHEN all_picks.result = 'win'::pick_result THEN 1
                    ELSE NULL::integer
                END) AS total_wins,
            count(
                CASE
                    WHEN all_picks.result = 'loss'::pick_result THEN 1
                    ELSE NULL::integer
                END) AS total_losses,
            count(
                CASE
                    WHEN all_picks.result = 'push'::pick_result THEN 1
                    ELSE NULL::integer
                END) AS total_pushes,
            count(
                CASE
                    WHEN all_picks.result = 'win'::pick_result AND all_picks.is_lock THEN 1
                    ELSE NULL::integer
                END) AS lock_wins,
            count(
                CASE
                    WHEN all_picks.result = 'loss'::pick_result AND all_picks.is_lock THEN 1
                    ELSE NULL::integer
                END) AS lock_losses,
            count(
                CASE
                    WHEN all_picks.result = 'push'::pick_result AND all_picks.is_lock THEN 1
                    ELSE NULL::integer
                END) AS lock_pushes,
            COALESCE(sum(all_picks.points_earned), 0::bigint) AS total_points,
            max(all_picks.payment_status) AS payment_status,
            max(
                CASE
                    WHEN all_picks.payment_status = 'Paid'::text AND all_picks.is_matched = true THEN 1
                    ELSE 0
                END) = 1 AS is_verified,
                CASE
                    WHEN count(DISTINCT all_picks.pick_source) > 1 THEN 'mixed'::text
                    ELSE max(all_picks.pick_source)
                END AS pick_source
           FROM all_picks
          WHERE all_picks.result IS NOT NULL
          GROUP BY all_picks.user_id, all_picks.display_name, all_picks.season
         HAVING count(all_picks.pick_id) > 0
        )
 SELECT user_id,
    display_name,
    season,
    total_picks,
    total_wins,
    total_losses,
    total_pushes,
    lock_wins,
    lock_losses,
    lock_pushes,
    total_points,
    rank() OVER (PARTITION BY season ORDER BY total_points DESC, total_wins DESC, display_name) AS season_rank,
    payment_status,
    is_verified,
    pick_source
   FROM combined_user_stats
  ORDER BY season DESC, total_points DESC, total_wins DESC;
;
