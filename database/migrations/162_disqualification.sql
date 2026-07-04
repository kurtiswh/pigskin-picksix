-- Migration 162: 7-pick disqualification (Part B / B4b)
--
-- Per-game locks (161) allow a locked Thursday pick to coexist with a full new
-- Saturday set, so an entry can end up with >6 counted picks. Rule: drop the
-- HIGHEST-value non-locked (newly-submitted) pick as a penalty for over-picking,
-- returning the entry to 6. A locked pick is never dropped.
--
-- Mechanism: a `disqualified` flag on picks (nothing is deleted; scoring/stored
-- values are untouched). The leaderboard views exclude disqualified picks. An
-- admin confirms each proposed drop in Week Review.
--
-- Safety: adds a column defaulting to false (no existing row changes value),
-- recreates the two leaderboard views verbatim from migration 155 with a single
-- added filter (AND NOT disqualified) in each of the four WHERE clauses, and
-- preserves security_invoker = false. With zero disqualified rows the views
-- return exactly what they do today.

-- ── 1. Flag (no historical values change) ──────────────────────────────────
ALTER TABLE public.picks           ADD COLUMN IF NOT EXISTS disqualified boolean NOT NULL DEFAULT false;
ALTER TABLE public.anonymous_picks ADD COLUMN IF NOT EXISTS disqualified boolean NOT NULL DEFAULT false;

-- ── 2. Recreate leaderboard views excluding disqualified picks ─────────────
CREATE OR REPLACE VIEW public.weekly_leaderboard AS
 WITH combined_picks AS (
         SELECT u.id AS user_id,
            u.display_name,
            p.week,
            p.season,
            count(p.id) AS picks_made,
            count(CASE WHEN p.result = 'win'::pick_result THEN 1 ELSE NULL::integer END) AS wins,
            count(CASE WHEN p.result = 'loss'::pick_result THEN 1 ELSE NULL::integer END) AS losses,
            count(CASE WHEN p.result = 'push'::pick_result THEN 1 ELSE NULL::integer END) AS pushes,
            count(CASE WHEN p.result = 'win'::pick_result AND p.is_lock THEN 1 ELSE NULL::integer END) AS lock_wins,
            count(CASE WHEN p.result = 'loss'::pick_result AND p.is_lock THEN 1 ELSE NULL::integer END) AS lock_losses,
            count(CASE WHEN p.result = 'push'::pick_result AND p.is_lock THEN 1 ELSE NULL::integer END) AS lock_pushes,
            COALESCE(sum(p.points_earned), 0::bigint) AS total_points,
            COALESCE(lsp.status, 'NotPaid'::text) AS payment_status,
            COALESCE(lsp.status = 'Paid'::text AND lsp.is_matched = true, false) AS is_verified,
            'authenticated'::text AS pick_source
           FROM users u
             JOIN picks p ON u.id = p.user_id
             LEFT JOIN leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
          WHERE p.submitted = true AND p.show_on_leaderboard = true AND NOT p.disqualified AND (lsp.status = 'Paid'::text OR p.week <= (SELECT grace_period_weeks FROM app_settings LIMIT 1))
          GROUP BY u.id, u.display_name, p.week, p.season, lsp.status, lsp.is_matched
         HAVING count(p.id) > 0
        UNION ALL
         SELECT u.id AS user_id,
            u.display_name,
            ap.week,
            ap.season,
            count(ap.id) AS picks_made,
            count(CASE WHEN g.status = 'completed'::game_status AND (ap.selected_team = g.home_team AND (g.home_score::numeric + g.spread) > g.away_score::numeric OR ap.selected_team = g.away_team AND (g.away_score::numeric - g.spread) > g.home_score::numeric) THEN 1 ELSE NULL::integer END) AS wins,
            count(CASE WHEN g.status = 'completed'::game_status AND NOT (ap.selected_team = g.home_team AND (g.home_score::numeric + g.spread) > g.away_score::numeric OR ap.selected_team = g.away_team AND (g.away_score::numeric - g.spread) > g.home_score::numeric) AND abs(g.home_score::numeric + g.spread - g.away_score::numeric) >= 0.5 THEN 1 ELSE NULL::integer END) AS losses,
            count(CASE WHEN g.status = 'completed'::game_status AND abs(g.home_score::numeric + g.spread - g.away_score::numeric) < 0.5 THEN 1 ELSE NULL::integer END) AS pushes,
            count(CASE WHEN g.status = 'completed'::game_status AND ap.is_lock AND (ap.selected_team = g.home_team AND (g.home_score::numeric + g.spread) > g.away_score::numeric OR ap.selected_team = g.away_team AND (g.away_score::numeric - g.spread) > g.home_score::numeric) THEN 1 ELSE NULL::integer END) AS lock_wins,
            count(CASE WHEN g.status = 'completed'::game_status AND ap.is_lock AND NOT (ap.selected_team = g.home_team AND (g.home_score::numeric + g.spread) > g.away_score::numeric OR ap.selected_team = g.away_team AND (g.away_score::numeric - g.spread) > g.home_score::numeric) AND abs(g.home_score::numeric + g.spread - g.away_score::numeric) >= 0.5 THEN 1 ELSE NULL::integer END) AS lock_losses,
            count(CASE WHEN g.status = 'completed'::game_status AND ap.is_lock AND abs(g.home_score::numeric + g.spread - g.away_score::numeric) < 0.5 THEN 1 ELSE NULL::integer END) AS lock_pushes,
            COALESCE(sum(CASE WHEN g.status = 'completed'::game_status THEN ap.points_earned ELSE 0 END), 0::bigint) AS total_points,
            COALESCE(lsp.status, 'NotPaid'::text) AS payment_status,
            COALESCE(lsp.status = 'Paid'::text AND lsp.is_matched = true, false) AS is_verified,
            'anonymous'::text AS pick_source
           FROM users u
             JOIN anonymous_picks ap ON u.id = ap.assigned_user_id
             JOIN games g ON ap.game_id = g.id
             LEFT JOIN leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = ap.season
          WHERE ap.show_on_leaderboard = true AND NOT ap.disqualified AND (lsp.status = 'Paid'::text OR ap.week <= (SELECT grace_period_weeks FROM app_settings LIMIT 1)) AND NOT (EXISTS ( SELECT 1
                   FROM picks p
                  WHERE p.user_id = u.id AND p.week = ap.week AND p.season = ap.season AND p.submitted = true AND p.show_on_leaderboard = true))
          GROUP BY u.id, u.display_name, ap.week, ap.season, lsp.status, lsp.is_matched
         HAVING count(ap.id) > 0
        )
 SELECT user_id, display_name, week, season, picks_made, wins, losses, pushes,
    lock_wins, lock_losses, lock_pushes, total_points,
    rank() OVER (PARTITION BY week, season ORDER BY total_points DESC, wins DESC, display_name) AS weekly_rank,
    payment_status, is_verified, pick_source
   FROM combined_picks
  ORDER BY week DESC, season DESC, total_points DESC, wins DESC;
ALTER VIEW public.weekly_leaderboard SET (security_invoker = false);

CREATE OR REPLACE VIEW public.season_leaderboard AS
 WITH all_picks AS (
         SELECT u.id AS user_id, u.display_name, p.season, p.id AS pick_id,
            p.result, p.is_lock, p.points_earned,
            COALESCE(lsp.status, 'NotPaid'::text) AS payment_status,
            lsp.is_matched, 'authenticated'::text AS pick_source
           FROM users u
             JOIN picks p ON u.id = p.user_id
             LEFT JOIN leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = p.season
          WHERE p.submitted = true AND p.show_on_leaderboard = true AND NOT p.disqualified AND (lsp.status = 'Paid'::text OR (SELECT COALESCE(MAX(ws.week),0) FROM week_settings ws WHERE ws.season = p.season AND ws.games_selected) <= (SELECT grace_period_weeks FROM app_settings LIMIT 1))
        UNION ALL
         SELECT u.id AS user_id, u.display_name, ap.season, ap.id AS pick_id,
                CASE
                    WHEN g.status = 'completed'::game_status AND (ap.selected_team = g.home_team AND (g.home_score::numeric + g.spread) > g.away_score::numeric OR ap.selected_team = g.away_team AND (g.away_score::numeric - g.spread) > g.home_score::numeric) THEN 'win'::pick_result
                    WHEN g.status = 'completed'::game_status AND abs(g.home_score::numeric + g.spread - g.away_score::numeric) < 0.5 THEN 'push'::pick_result
                    WHEN g.status = 'completed'::game_status THEN 'loss'::pick_result
                    ELSE NULL::pick_result
                END AS result,
            ap.is_lock,
                CASE WHEN g.status = 'completed'::game_status THEN ap.points_earned ELSE 0 END AS points_earned,
            COALESCE(lsp.status, 'NotPaid'::text) AS payment_status,
            lsp.is_matched, 'anonymous'::text AS pick_source
           FROM users u
             JOIN anonymous_picks ap ON u.id = ap.assigned_user_id
             JOIN games g ON ap.game_id = g.id
             LEFT JOIN leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = ap.season
          WHERE ap.show_on_leaderboard = true AND NOT ap.disqualified AND (lsp.status = 'Paid'::text OR (SELECT COALESCE(MAX(ws.week),0) FROM week_settings ws WHERE ws.season = ap.season AND ws.games_selected) <= (SELECT grace_period_weeks FROM app_settings LIMIT 1)) AND NOT (EXISTS ( SELECT 1
                   FROM picks p
                  WHERE p.user_id = u.id AND p.week = ap.week AND p.season = ap.season AND p.submitted = true AND p.show_on_leaderboard = true))
        ), combined_user_stats AS (
         SELECT all_picks.user_id, all_picks.display_name, all_picks.season,
            count(all_picks.pick_id) AS total_picks,
            count(CASE WHEN all_picks.result = 'win'::pick_result THEN 1 ELSE NULL::integer END) AS total_wins,
            count(CASE WHEN all_picks.result = 'loss'::pick_result THEN 1 ELSE NULL::integer END) AS total_losses,
            count(CASE WHEN all_picks.result = 'push'::pick_result THEN 1 ELSE NULL::integer END) AS total_pushes,
            count(CASE WHEN all_picks.result = 'win'::pick_result AND all_picks.is_lock THEN 1 ELSE NULL::integer END) AS lock_wins,
            count(CASE WHEN all_picks.result = 'loss'::pick_result AND all_picks.is_lock THEN 1 ELSE NULL::integer END) AS lock_losses,
            count(CASE WHEN all_picks.result = 'push'::pick_result AND all_picks.is_lock THEN 1 ELSE NULL::integer END) AS lock_pushes,
            COALESCE(sum(all_picks.points_earned), 0::bigint) AS total_points,
            max(all_picks.payment_status) AS payment_status,
            max(CASE WHEN all_picks.payment_status = 'Paid'::text AND all_picks.is_matched = true THEN 1 ELSE 0 END) = 1 AS is_verified,
                CASE WHEN count(DISTINCT all_picks.pick_source) > 1 THEN 'mixed'::text ELSE max(all_picks.pick_source) END AS pick_source
           FROM all_picks
          WHERE all_picks.result IS NOT NULL
          GROUP BY all_picks.user_id, all_picks.display_name, all_picks.season
         HAVING count(all_picks.pick_id) > 0
        )
 SELECT user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
    lock_wins, lock_losses, lock_pushes, total_points,
    rank() OVER (PARTITION BY season ORDER BY total_points DESC, total_wins DESC, display_name) AS season_rank,
    payment_status, is_verified, pick_source
   FROM combined_user_stats
  ORDER BY season DESC, total_points DESC, total_wins DESC;
ALTER VIEW public.season_leaderboard SET (security_invoker = false);

-- ── 3. Detection: entries with >6 counted picks + the proposed drop ────────
-- Proposed drop = the highest-value NON-locked pick (locks ordered last so they
-- are never chosen). Deterministic tiebreak: higher points, later submission, id.
CREATE OR REPLACE FUNCTION public.detect_overpick_entries(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  pick_count bigint,
  proposed_pick_id uuid,
  proposed_desc text,
  proposed_points integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT p.user_id, count(*) AS cnt
    FROM picks p
    WHERE p.week = p_week AND p.season = p_season
      AND p.submitted = true AND NOT p.disqualified
    GROUP BY p.user_id
    HAVING count(*) > 6
  ),
  ranked AS (
    SELECT p.user_id, p.id AS pick_id, p.selected_team, p.points_earned, p.is_lock,
           g.away_team, g.home_team,
           row_number() OVER (
             PARTITION BY p.user_id
             ORDER BY p.is_lock ASC,
                      COALESCE(p.points_earned, -1) DESC,
                      p.submitted_at DESC NULLS LAST,
                      p.id
           ) AS rn
    FROM picks p
    JOIN games g ON g.id = p.game_id
    JOIN counts c ON c.user_id = p.user_id
    WHERE p.week = p_week AND p.season = p_season
      AND p.submitted = true AND NOT p.disqualified
  )
  SELECT c.user_id, u.display_name, c.cnt,
         r.pick_id,
         (r.away_team || ' @ ' || r.home_team || ' — ' || r.selected_team) AS proposed_desc,
         r.points_earned
  FROM counts c
  JOIN users u ON u.id = c.user_id
  JOIN ranked r ON r.user_id = c.user_id AND r.rn = 1
  WHERE NOT r.is_lock;
$$;

GRANT EXECUTE ON FUNCTION public.detect_overpick_entries(integer, integer) TO authenticated;

-- ── 4. Apply / undo a disqualification (admin-confirmed in Week Review) ────
CREATE OR REPLACE FUNCTION public.set_pick_disqualified(p_pick_id uuid, p_disqualified boolean DEFAULT true)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.picks
  SET disqualified = p_disqualified, updated_at = now()
  WHERE id = p_pick_id;
$$;

GRANT EXECUTE ON FUNCTION public.set_pick_disqualified(uuid, boolean) TO authenticated;
