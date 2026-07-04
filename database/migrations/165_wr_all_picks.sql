-- Migration 165: "All Picks by week" data for Week Review (Part B / B2)
--
-- Returns every submitted authenticated pick for a week (one row per pick),
-- joined to the player and game, so the Week Review screen can render a single
-- per-player table. SECURITY DEFINER so it isn't RLS-restricted or row-capped.

CREATE OR REPLACE FUNCTION public.wr_all_picks(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  is_paid boolean,
  pick_id uuid,
  matchup text,
  selected_team text,
  spread numeric,
  is_lock boolean,
  result text,
  points_earned integer,
  disqualified boolean,
  kickoff_time timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    g.kickoff_time
  FROM public.picks p
  JOIN public.users u ON u.id = p.user_id
  JOIN public.games g ON g.id = p.game_id
  WHERE p.season = p_season AND p.week = p_week AND p.submitted = true
  ORDER BY u.display_name, g.kickoff_time;
$$;

GRANT EXECUTE ON FUNCTION public.wr_all_picks(integer, integer) TO authenticated;
