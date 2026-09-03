-- Migration 218: emails in the All Picks review, admin gate added with them
--
-- The commissioner wants each row's email for cross-referencing entries
-- against the payment register. wr_all_picks was EXECUTE-granted to all of
-- `authenticated` (harmless while it exposed only display_name and picks,
-- both public anyway), but adding users.email to the output would have let
-- any signed-in player enumerate every entrant's address with one RPC call.
-- Same guard as find_missing_pick_confirmations: assert_admin_or_server(),
-- which also keeps the cron/service-role path working. Week Review is
-- admin-only UI, so no legitimate caller loses access.

DROP FUNCTION IF EXISTS public.wr_all_picks(integer, integer);

CREATE FUNCTION public.wr_all_picks(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid, display_name text, email text, is_paid boolean,
  pick_id uuid, matchup text, selected_team text, spread numeric,
  is_lock boolean, result text, points_earned integer, disqualified boolean,
  kickoff_time timestamptz, pick_source text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_admin_or_server();

  RETURN QUERY
  SELECT
    p.user_id,
    u.display_name,
    lower(u.email) AS email,
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
    -- the address the entry was submitted under, which is what the
    -- commissioner is reconciling against; may differ from the account email
    lower(ap.email) AS email,
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
    AND NOT EXISTS (
      SELECT 1 FROM public.picks p
      WHERE p.user_id = ap.assigned_user_id
        AND p.week = ap.week AND p.season = ap.season
        AND p.submitted = true AND p.show_on_leaderboard = true
    )

  ORDER BY display_name, kickoff_time;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_all_picks(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_all_picks(integer, integer) TO authenticated, service_role;
