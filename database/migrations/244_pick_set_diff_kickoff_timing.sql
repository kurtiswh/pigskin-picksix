-- Migration 244: show when a pick on a duplicate sheet was made after kickoff
--
-- The comparison grid shows which team each sheet picked but nothing about
-- when. Asked of Griffin Knipp, week 2: his anonymous entry was submitted 9/11
-- and his account sheet 9/12, and the anonymous one carries Missouri @ Kansas,
-- a game that kicked at 7pm Central on the 11th. Reading the panel alone there
-- is no way to tell whether that pick beat its own kickoff.
--
-- It did, by an hour and 44 minutes, and no pick anywhere in week 2 was made
-- after its game started. But answering that took a query, which is the wrong
-- place for it: a second sheet built the next day is exactly the shape where a
-- pick with the result already known would hide, so the panel should say.
--
-- made_after_kickoff compares the pick's own created_at against its own game,
-- which is the question that matters. A sheet submitted after some other game
-- kicked is normal and not interesting; a pick made after the game it names has
-- started is never legitimate.

DROP FUNCTION IF EXISTS public.wr_pick_set_diff(integer, integer);

CREATE FUNCTION public.wr_pick_set_diff(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid, display_name text,
  game_id uuid, matchup text, kickoff_time timestamptz,
  source text, set_label text,
  selected_team text, is_lock boolean, counted boolean,
  result text, points_earned integer,
  game_disagrees boolean, sheets_with_pick integer,
  made_after_kickoff boolean
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
      p.points_earned AS cell_points,
      p.created_at AS cell_created
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
      ap.points_earned,
      ap.created_at
    FROM public.anonymous_picks ap
    WHERE ap.season = p_season AND ap.week = p_week
      AND ap.assigned_user_id IS NOT NULL
  ), sheet_count AS (
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
    pg.n_with_pick,
    (c.cell_created > g.kickoff_time)
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
