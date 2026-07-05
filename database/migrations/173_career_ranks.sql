-- Recompute player_career_stats WITH all-player ranks (window functions), so the
-- profile can fetch a single row (its own) and still show "top N%" context —
-- avoids the PostgREST 1000-row cap and is far faster.
DROP MATERIALIZED VIEW IF EXISTS public.player_career_stats;

CREATE MATERIALIZED VIEW public.player_career_stats AS
  WITH base AS (
    SELECT
      f.user_id, u.display_name,
      count(*) AS seasons_played,
      sum(f.total_points) AS career_points,
      round(avg(f.total_points), 1) AS avg_season_points,
      sum(f.wins) AS career_wins, sum(f.losses) AS career_losses, sum(f.pushes) AS career_pushes,
      round(sum(f.wins)::numeric / nullif(sum(f.wins) + sum(f.losses), 0), 4) AS win_pct,
      sum(f.lock_wins) AS career_lock_wins, sum(f.lock_losses) AS career_lock_losses,
      round(sum(f.lock_wins)::numeric / nullif(sum(f.lock_wins) + sum(f.lock_losses), 0), 4) AS lock_win_pct,
      min(f.rank) AS best_finish, round(avg(f.rank), 1) AS avg_finish,
      max(f.total_points) AS best_season_points,
      count(*) FILTER (WHERE f.rank <= 3) AS top3_finishes,
      count(*) FILTER (WHERE f.rank <= 10) AS top10_finishes,
      COALESCE(t.championships, 0) AS championships,
      COALESCE(t.runner_ups, 0) AS runner_ups,
      COALESCE(t.best_finish_titles, 0) AS best_finish_titles,
      COALESCE(t.lock_titles, 0) AS lock_titles,
      COALESCE(t.weekly_wins, 0) AS weekly_wins
    FROM public.all_season_finishes f
    JOIN public.users u ON u.id = f.user_id
    LEFT JOIN public.player_titles t ON t.user_id = f.user_id
    GROUP BY f.user_id, u.display_name, t.championships, t.runner_ups,
             t.best_finish_titles, t.lock_titles, t.weekly_wins
  )
  SELECT *,
    count(*) OVER () AS total_players,
    rank() OVER (ORDER BY career_points DESC)          AS career_points_rank,
    rank() OVER (ORDER BY avg_season_points DESC)      AS avg_season_points_rank,
    rank() OVER (ORDER BY win_pct DESC NULLS LAST)     AS win_pct_rank,
    rank() OVER (ORDER BY lock_win_pct DESC NULLS LAST) AS lock_win_pct_rank,
    rank() OVER (ORDER BY avg_finish ASC NULLS LAST)   AS avg_finish_rank
  FROM base;
CREATE UNIQUE INDEX player_career_stats_pk ON public.player_career_stats (user_id);
GRANT SELECT ON public.player_career_stats TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_stats_views()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  REFRESH MATERIALIZED VIEW public.all_season_finishes;
  REFRESH MATERIALIZED VIEW public.player_career_stats;
$$;
