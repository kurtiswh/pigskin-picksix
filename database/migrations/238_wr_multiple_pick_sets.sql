-- Migration 238: surface players holding more than one pick set for the week
--
-- Both leaderboard readers resolve a duplicate entry silently. wr_all_picks
-- and season_leaderboard require submitted = true on authenticated picks and
-- drop an anonymous set for any week that already has a submitted one, so the
-- All Picks table shows whichever picks counted and says nothing about the
-- sheet behind them. Week 1 of 2026 holds three, and Week Review could see
-- none: Randy Moore and Chris Miller each have an unsubmitted authenticated
-- sheet sitting behind their counted anonymous entry, and txaggie123 has a
-- submitted authenticated sheet suppressing an anonymous duplicate whose
-- picks are not even the same (86 points counted, 63 ignored).
--
-- Silence is only safe while every reader applies that precedence, and one
-- did not -- the expanded season breakdown counted both sides and doubled
-- Randy's week to 12-0-0 for 244 points against the 6-0-0 and 122 on his
-- season row. The commissioner needs to see that a second sheet exists to
-- decide what it is: a double submission, an entry under the wrong account,
-- or a sheet the player believes is live.
--
-- A "set" is one authenticated sheet per player (all of their picks rows for
-- the week) plus one anonymous sheet per submission address, since a player
-- can submit under more than one. Only players holding more than one are
-- returned.
--
-- Counting is per PICK, not per set, because show_on_leaderboard is a
-- per-pick flag and an admin can build a legal six across two submissions
-- with it. Patrick Nagle, 2025 week 8, is the case: two anonymous entries
-- under two addresses, five picks shown from one and one from the other, so
-- the standings count six and nothing is wrong. A set-level boolean would
-- have called that double counting. counted_picks therefore repeats the
-- filters the readers apply (submitted + shown + not disqualified for an
-- account sheet; shown + not disqualified for an anonymous one, zeroed
-- entirely when a submitted account sheet exists), and the sum across a
-- player's sets is what the standings actually score. Over six is the real
-- alarm; six drawn from two sheets is worth seeing but not a fault.
--
-- Admin-gated for the same reason as 218: the output carries emails.

DROP FUNCTION IF EXISTS public.wr_multiple_pick_sets(integer, integer);

CREATE FUNCTION public.wr_multiple_pick_sets(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid, display_name text, account_email text,
  source text, set_label text,
  pick_count integer, counted_picks integer,
  lock_count integer, counted_locks integer,
  is_submitted boolean, disqualified_count integer,
  points integer, counted_points integer,
  last_submitted_at timestamptz,
  counts_for_leaderboard boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_admin_or_server();

  RETURN QUERY
  WITH gate AS (
    -- the precedence the readers apply: a submitted account sheet takes the week
    SELECT DISTINCT p.user_id AS gated_user
    FROM public.picks p
    WHERE p.season = p_season AND p.week = p_week
      AND p.submitted = true AND p.show_on_leaderboard = true
  ), sets AS (
    SELECT
      p.user_id AS set_user_id,
      'authenticated'::text AS set_source,
      lower(u.email) AS label,
      count(*)::int AS n_picks,
      count(*) FILTER (
        WHERE p.submitted AND p.show_on_leaderboard AND NOT p.disqualified
      )::int AS n_counted,
      count(*) FILTER (WHERE p.is_lock)::int AS n_locks,
      count(*) FILTER (
        WHERE p.is_lock AND p.submitted AND p.show_on_leaderboard AND NOT p.disqualified
      )::int AS n_counted_locks,
      bool_or(p.submitted) AS any_submitted,
      count(*) FILTER (WHERE p.disqualified)::int AS n_disqualified,
      COALESCE(sum(p.points_earned), 0)::int AS set_points,
      COALESCE(sum(p.points_earned) FILTER (
        WHERE p.submitted AND p.show_on_leaderboard AND NOT p.disqualified
      ), 0)::int AS counted_set_points,
      max(p.submitted_at) AS last_submit
    FROM public.picks p
    JOIN public.users u ON u.id = p.user_id
    WHERE p.season = p_season AND p.week = p_week
    GROUP BY p.user_id, lower(u.email)

    UNION ALL

    SELECT
      ap.assigned_user_id,
      'anonymous'::text,
      lower(ap.email),
      count(*)::int,
      count(*) FILTER (
        WHERE ap.show_on_leaderboard AND NOT COALESCE(ap.disqualified, false)
          AND NOT EXISTS (SELECT 1 FROM gate WHERE gated_user = ap.assigned_user_id)
      )::int,
      count(*) FILTER (WHERE ap.is_lock)::int,
      count(*) FILTER (
        WHERE ap.is_lock AND ap.show_on_leaderboard AND NOT COALESCE(ap.disqualified, false)
          AND NOT EXISTS (SELECT 1 FROM gate WHERE gated_user = ap.assigned_user_id)
      )::int,
      bool_or(COALESCE(ap.submitted, true)),
      count(*) FILTER (WHERE COALESCE(ap.disqualified, false))::int,
      COALESCE(sum(ap.points_earned), 0)::int,
      -- the readers score an anonymous pick only once its game is complete
      COALESCE(sum(CASE WHEN g.status = 'completed'::game_status THEN ap.points_earned ELSE 0 END) FILTER (
        WHERE ap.show_on_leaderboard AND NOT COALESCE(ap.disqualified, false)
          AND NOT EXISTS (SELECT 1 FROM gate WHERE gated_user = ap.assigned_user_id)
      ), 0)::int,
      max(ap.submitted_at)
    FROM public.anonymous_picks ap
    JOIN public.games g ON g.id = ap.game_id
    WHERE ap.season = p_season AND ap.week = p_week
      AND ap.assigned_user_id IS NOT NULL
    GROUP BY ap.assigned_user_id, lower(ap.email)
  )
  SELECT
    s.set_user_id,
    u.display_name,
    lower(u.email),
    s.set_source,
    s.label,
    s.n_picks,
    s.n_counted,
    s.n_locks,
    s.n_counted_locks,
    s.any_submitted,
    s.n_disqualified,
    s.set_points,
    s.counted_set_points,
    s.last_submit,
    s.n_counted > 0
  FROM sets s
  JOIN public.users u ON u.id = s.set_user_id
  WHERE s.set_user_id IN (
    SELECT set_user_id FROM sets GROUP BY set_user_id HAVING count(*) > 1
  )
  ORDER BY u.display_name, s.set_source, s.label;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_multiple_pick_sets(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_multiple_pick_sets(integer, integer) TO authenticated, service_role;
