-- 257: weekly_summaries(p_season, p_exclude_week): one row of totals per week
--
-- The Games page's week overview (records strip, "vs. avg" tiles) and the recap draft
-- downloaded every weekly_leaderboard row for the season except the week being viewed
-- (~4,700 rows by week 10) only to add them up per week in the browser. On 2026-11-07 that
-- was 747 downloads, estimated as the largest remaining source of Supabase egress on the
-- Free plan. This returns the same per-week totals, ~10 rows.
--
-- Mirrors src/lib/weekRecords.ts summarizeWeek():
--   entries   rows with picks_made > 0 or any result (wins + losses + pushes > 0)
--   perfect   6-0-0 ; zero 0-6-0 ; over100 total_points > 100
--   points / wins / losses / lock_wins / lock_losses   summed over those entries
-- plus, for GameStatsOverview's "average score" (which only counts rows with a result):
--   scored_entries / scored_points   rows with wins + losses + pushes > 0
-- perfect, zero and over100 imply a result, so they are the same under either filter.
--
-- SECURITY INVOKER: callers see what weekly_leaderboard shows them.

CREATE OR REPLACE FUNCTION public.weekly_summaries(p_season integer, p_exclude_week integer DEFAULT NULL)
RETURNS TABLE (
  week integer,
  entries bigint,
  perfect bigint,
  zero bigint,
  over100 bigint,
  points bigint,
  wins bigint,
  losses bigint,
  lock_wins bigint,
  lock_losses bigint,
  scored_entries bigint,
  scored_points bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH e AS (
    SELECT
      wl.week,
      COALESCE(wl.picks_made, 0) AS pm,
      COALESCE(wl.wins, 0) AS w,
      COALESCE(wl.losses, 0) AS l,
      COALESCE(wl.pushes, 0) AS p,
      COALESCE(wl.total_points, 0) AS pts,
      COALESCE(wl.lock_wins, 0) AS lw,
      COALESCE(wl.lock_losses, 0) AS ll
    FROM weekly_leaderboard wl
    WHERE wl.season = p_season
      AND (p_exclude_week IS NULL OR wl.week <> p_exclude_week)
  )
  SELECT
    e.week,
    count(*),
    count(*) FILTER (WHERE e.w = 6 AND e.l = 0 AND e.p = 0),
    count(*) FILTER (WHERE e.w = 0 AND e.l = 6 AND e.p = 0),
    count(*) FILTER (WHERE e.pts > 100),
    sum(e.pts)::bigint,
    sum(e.w)::bigint,
    sum(e.l)::bigint,
    sum(e.lw)::bigint,
    sum(e.ll)::bigint,
    count(*) FILTER (WHERE e.w + e.l + e.p > 0),
    COALESCE(sum(e.pts) FILTER (WHERE e.w + e.l + e.p > 0), 0)::bigint
  FROM e
  WHERE e.pm > 0 OR e.w + e.l + e.p > 0
  GROUP BY e.week
  ORDER BY e.week;
$$;

GRANT EXECUTE ON FUNCTION public.weekly_summaries(integer, integer) TO anon, authenticated;
