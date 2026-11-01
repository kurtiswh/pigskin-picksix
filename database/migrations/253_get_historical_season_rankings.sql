-- 253: get_historical_season_rankings(p_season, p_through_week)
--
-- The season leaderboard has always called this RPC to work out rank changes and the
-- "as of week N" view, but the function was never created. Every call 404'd and the client
-- fell back to fetching the whole weekly_leaderboard once per week of the season, twice
-- for the as-of view. On 2026-10-31 that fallback was 7,684 requests, the single biggest
-- source of Supabase egress.
--
-- This returns the season standings through a given week, one row per player, already
-- ranked. It applies the same eligibility rule as season_leaderboard (Paid, or still inside
-- the grace period) and the same tiebreak (points, then wins, then display name).
-- Validated against season_leaderboard for 2026 through week 9: 656 rows, zero point,
-- record or rank mismatches.
--
-- SECURITY INVOKER (the default), so callers see exactly what weekly_leaderboard shows them.

CREATE OR REPLACE FUNCTION public.get_historical_season_rankings(
  p_season integer,
  p_through_week integer
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  total_points bigint,
  total_wins bigint,
  total_losses bigint,
  total_pushes bigint,
  lock_wins bigint,
  lock_losses bigint,
  lock_pushes bigint,
  payment_status text,
  pick_source text,
  season_rank bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH eligible AS (
    SELECT wl.*
    FROM weekly_leaderboard wl
    WHERE wl.season = p_season
      AND wl.week <= p_through_week
      AND (
        wl.payment_status = 'Paid'
        OR (SELECT COALESCE(MAX(ws.week), 0) FROM week_settings ws
            WHERE ws.season = wl.season AND ws.games_selected)
           <= (SELECT grace_period_weeks FROM app_settings LIMIT 1)
      )
  ),
  agg AS (
    SELECT
      e.user_id,
      MAX(e.display_name) AS display_name,
      COALESCE(SUM(e.total_points), 0)::bigint AS total_points,
      COALESCE(SUM(e.wins), 0)::bigint AS total_wins,
      COALESCE(SUM(e.losses), 0)::bigint AS total_losses,
      COALESCE(SUM(e.pushes), 0)::bigint AS total_pushes,
      COALESCE(SUM(e.lock_wins), 0)::bigint AS lock_wins,
      COALESCE(SUM(e.lock_losses), 0)::bigint AS lock_losses,
      COALESCE(SUM(e.lock_pushes), 0)::bigint AS lock_pushes,
      MAX(e.payment_status) AS payment_status,
      CASE WHEN COUNT(DISTINCT e.pick_source) > 1 THEN 'mixed' ELSE MAX(e.pick_source) END AS pick_source
    FROM eligible e
    GROUP BY e.user_id
  )
  SELECT
    a.*,
    rank() OVER (ORDER BY a.total_points DESC, a.total_wins DESC, a.display_name) AS season_rank
  FROM agg a
  ORDER BY season_rank, a.display_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_historical_season_rankings(integer, integer) TO anon, authenticated;
