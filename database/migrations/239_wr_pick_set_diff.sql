-- Migration 239: show where a player's duplicate sheets actually differ
--
-- 238 answers "how many sheets, and which counts". It cannot answer the
-- question that follows, which is whether the ignored sheet is the same picks
-- or different ones. Week 1 of 2026 has one of each: Randy Moore's two sheets
-- are identical, so the duplicate is noise; txaggie123's disagree on two games
-- AND put the lock on different games, which is the whole 86-vs-63 gap. Those
-- two need different decisions and looked the same in the review.
--
-- One row per player, game and sheet, so a player holding three sheets works
-- the same as one holding two (Patrick Nagle, 2025 week 8, holds two anonymous
-- entries). game_disagrees is computed per player+game across every sheet:
-- true when the sheets name different teams, put the lock in different places,
-- or one sheet has no pick for that game at all. The caller pivots these rows
-- into a grid; sheets_with_pick tells it which cells are genuinely empty.
--
-- counted repeats 238's per-pick filters so a cell can say whether that
-- specific pick is the one being scored.
--
-- Admin-gated: carries the submission addresses, same as 218 and 238.

DROP FUNCTION IF EXISTS public.wr_pick_set_diff(integer, integer);

CREATE FUNCTION public.wr_pick_set_diff(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid, display_name text,
  game_id uuid, matchup text, kickoff_time timestamptz,
  source text, set_label text,
  selected_team text, is_lock boolean, counted boolean,
  result text, points_earned integer,
  game_disagrees boolean, sheets_with_pick integer
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
    SELECT DISTINCT p.user_id AS gated_user
    FROM public.picks p
    WHERE p.season = p_season AND p.week = p_week
      AND p.submitted = true AND p.show_on_leaderboard = true
  ), multi AS (
    SELECT DISTINCT s.user_id AS multi_user
    FROM public.wr_multiple_pick_sets(p_week, p_season) s
  ), cells AS (
    SELECT
      p.user_id AS cell_user,
      'authenticated'::text AS cell_source,
      lower(u.email) AS cell_label,
      p.game_id AS cell_game,
      p.selected_team AS cell_team,
      p.is_lock AS cell_lock,
      (p.submitted AND p.show_on_leaderboard AND NOT p.disqualified) AS cell_counted,
      p.result::text AS cell_result,
      p.points_earned AS cell_points
    FROM public.picks p
    JOIN public.users u ON u.id = p.user_id
    WHERE p.season = p_season AND p.week = p_week

    UNION ALL

    SELECT
      ap.assigned_user_id,
      'anonymous'::text,
      lower(ap.email),
      ap.game_id,
      ap.selected_team,
      ap.is_lock,
      (ap.show_on_leaderboard AND NOT COALESCE(ap.disqualified, false)
        AND NOT EXISTS (SELECT 1 FROM gate WHERE gated_user = ap.assigned_user_id)),
      ap.result::text,
      ap.points_earned
    FROM public.anonymous_picks ap
    WHERE ap.season = p_season AND ap.week = p_week
      AND ap.assigned_user_id IS NOT NULL
  ), sheet_count AS (
    -- how many distinct sheets the player holds, so a game missing from one of
    -- them counts as a disagreement rather than looking like agreement
    SELECT c.cell_user AS sc_user, count(DISTINCT (c.cell_source, c.cell_label)) AS n_sheets
    FROM cells c GROUP BY c.cell_user
  ), per_game AS (
    SELECT
      c.cell_user AS pg_user,
      c.cell_game AS pg_game,
      count(DISTINCT (c.cell_source, c.cell_label))::int AS n_with_pick,
      count(DISTINCT c.cell_team) > 1
        OR count(DISTINCT c.cell_lock) > 1
        OR count(DISTINCT (c.cell_source, c.cell_label)) < min(sc.n_sheets) AS disagrees
    FROM cells c
    JOIN sheet_count sc ON sc.sc_user = c.cell_user
    GROUP BY c.cell_user, c.cell_game
  )
  SELECT
    c.cell_user,
    u.display_name,
    c.cell_game,
    g.away_team || ' @ ' || g.home_team,
    g.kickoff_time,
    c.cell_source,
    c.cell_label,
    c.cell_team,
    c.cell_lock,
    c.cell_counted,
    c.cell_result,
    c.cell_points,
    pg.disagrees,
    pg.n_with_pick
  FROM cells c
  JOIN public.users u ON u.id = c.cell_user
  JOIN public.games g ON g.id = c.cell_game
  JOIN per_game pg ON pg.pg_user = c.cell_user AND pg.pg_game = c.cell_game
  WHERE c.cell_user IN (SELECT multi_user FROM multi)
  ORDER BY u.display_name, g.kickoff_time, c.cell_source, c.cell_label;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_pick_set_diff(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_pick_set_diff(integer, integer) TO authenticated, service_role;
