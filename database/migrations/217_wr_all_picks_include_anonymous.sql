-- Migration 217: Week Review's All Picks list was blind to anonymous entries
--
-- wr_all_picks read only public.picks, but an anonymous entry that the
-- auto-tie assigns to an account never gets rows there -- anonymous_picks is
-- its permanent home, and weekly_leaderboard already unions the two sources.
-- So a player like Trevor Bowman (6 picks, auto_validated, assigned, Paid)
-- ranked on the leaderboard while being invisible in the admin's own pick
-- review. 19 of week 1's players were in that state; the other ~148 submitted
-- while signed in and were never affected.
--
-- Same union and precedence as weekly_leaderboard: anonymous picks count only
-- when the user has no submitted authenticated picks for that week, and both
-- sources respect show_on_leaderboard and disqualified. A pick_source column
-- is appended so the admin can tell the routes apart; existing callers that
-- ignore it are unaffected.

DROP FUNCTION IF EXISTS public.wr_all_picks(integer, integer);

CREATE FUNCTION public.wr_all_picks(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid, display_name text, is_paid boolean,
  pick_id uuid, matchup text, selected_team text, spread numeric,
  is_lock boolean, result text, points_earned integer, disqualified boolean,
  kickoff_time timestamptz, pick_source text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    p.user_id,
    u.display_name,
    EXISTS (
      SELECT 1 FROM public.leaguesafe_payments lp
      WHERE lp.user_id = p.user_id AND lp.season = p_season AND lp.status = 'Paid'
    ) AS is_paid,
    p.id AS pick_id,
    (g.away_team || ' @ ' || g.home_team) AS matchup,
    p.selected_team,
    g.spread,
    p.is_lock,
    p.result::text AS result,
    p.points_earned,
    p.disqualified,
    g.kickoff_time,
    'authenticated'::text AS pick_source
  FROM public.picks p
  JOIN public.users u ON u.id = p.user_id
  JOIN public.games g ON g.id = p.game_id
  WHERE p.season = p_season AND p.week = p_week AND p.submitted = true

  UNION ALL

  SELECT
    ap.assigned_user_id,
    u.display_name,
    EXISTS (
      SELECT 1 FROM public.leaguesafe_payments lp
      WHERE lp.user_id = ap.assigned_user_id AND lp.season = p_season AND lp.status = 'Paid'
    ) AS is_paid,
    ap.id AS pick_id,
    (g.away_team || ' @ ' || g.home_team) AS matchup,
    ap.selected_team,
    g.spread,
    ap.is_lock,
    ap.result::text AS result,
    ap.points_earned,
    COALESCE(ap.disqualified, false) AS disqualified,
    g.kickoff_time,
    'anonymous'::text AS pick_source
  FROM public.anonymous_picks ap
  JOIN public.users u ON u.id = ap.assigned_user_id
  JOIN public.games g ON g.id = ap.game_id
  WHERE ap.season = p_season AND ap.week = p_week
    AND ap.assigned_user_id IS NOT NULL
    AND ap.show_on_leaderboard = true
    -- weekly_leaderboard's precedence rule, verbatim: an authenticated
    -- submission for the same week supersedes the anonymous entry.
    AND NOT EXISTS (
      SELECT 1 FROM public.picks p
      WHERE p.user_id = ap.assigned_user_id
        AND p.week = ap.week AND p.season = ap.season
        AND p.submitted = true AND p.show_on_leaderboard = true
    )

  ORDER BY display_name, kickoff_time;
$function$;

REVOKE ALL ON FUNCTION public.wr_all_picks(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_all_picks(integer, integer) TO authenticated, service_role;
