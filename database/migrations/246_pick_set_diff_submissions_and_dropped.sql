-- Migration 246: line the comparison grid up with split submissions, and mark
-- a dropped pick
--
-- 245 split anonymous sheets by submission and labels a repeat address #1, #2.
-- wr_pick_set_diff built its own label from the address alone, so for a player
-- who submitted twice the grid's columns no longer matched the sheets above
-- them and came back empty. Same labelling here.
--
-- Also return whether each pick is disqualified. A pick dropped by the
-- over-submission penalty stays on the sheet (245 made that possible again)
-- and the grid has to say so, or six counted picks and a seventh that was
-- taken off look identical.

DROP FUNCTION IF EXISTS public.wr_pick_set_diff(integer, integer);

CREATE FUNCTION public.wr_pick_set_diff(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid, display_name text,
  game_id uuid, matchup text, kickoff_time timestamptz,
  source text, set_label text,
  selected_team text, is_lock boolean, counted boolean,
  result text, points_earned integer,
  game_disagrees boolean, sheets_with_pick integer,
  made_after_kickoff boolean, dropped boolean
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
  ), anon_subs AS (
    -- must label submissions exactly as wr_multiple_pick_sets does, or the
    -- caller cannot line these cells up with the sheets they belong to
    SELECT ap.assigned_user_id AS sub_user,
           lower(ap.email) AS sub_email,
           date_trunc('second', ap.submitted_at) AS sub_at,
           row_number() OVER (PARTITION BY ap.assigned_user_id, lower(ap.email)
                              ORDER BY date_trunc('second', ap.submitted_at)) AS sub_no,
           count(*) OVER (PARTITION BY ap.assigned_user_id, lower(ap.email)) AS sub_total
    FROM public.anonymous_picks ap
    WHERE ap.season = p_season AND ap.week = p_week AND ap.assigned_user_id IS NOT NULL
    GROUP BY ap.assigned_user_id, lower(ap.email), date_trunc('second', ap.submitted_at)
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
      p.created_at AS cell_created,
      p.disqualified AS cell_dropped
    FROM public.picks p
    JOIN public.users u ON u.id = p.user_id
    WHERE p.season = p_season AND p.week = p_week

    UNION ALL

    SELECT
      ap.assigned_user_id,
      'anonymous'::text,
      lower(ap.email) || CASE WHEN s.sub_total > 1 THEN ' #' || s.sub_no ELSE '' END,
      ap.game_id,
      ap.selected_team,
      ap.is_lock,
      (ap.show_on_leaderboard AND NOT COALESCE(ap.disqualified, false)
        AND NOT EXISTS (SELECT 1 FROM gate WHERE gated_user = ap.assigned_user_id)),
      ap.result::text,
      ap.points_earned,
      ap.created_at,
      COALESCE(ap.disqualified, false)
    FROM public.anonymous_picks ap
    JOIN anon_subs s ON s.sub_user = ap.assigned_user_id
                    AND s.sub_email = lower(ap.email)
                    AND s.sub_at = date_trunc('second', ap.submitted_at)
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
    (c.cell_created > g.kickoff_time),
    c.cell_dropped
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
