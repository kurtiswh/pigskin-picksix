-- Materialize the heavy all-time stats so profile/Records reads are instant.
-- Historic data is static; 2025 is complete. Refresh via refresh_stats_views().

DROP VIEW IF EXISTS public.player_career_stats;
DROP VIEW IF EXISTS public.season_entrant_counts;
DROP VIEW IF EXISTS public.all_season_finishes;

CREATE MATERIALIZED VIEW public.all_season_finishes AS
  SELECT season, user_id, final_rank AS rank, total_points,
         wins, losses, pushes, lock_wins, lock_losses
    FROM public.historical_season_standings
  UNION ALL
  SELECT season, user_id, season_rank AS rank, total_points,
         total_wins, total_losses, total_pushes, lock_wins, lock_losses
    FROM public.season_leaderboard
   WHERE season >= 2016;
CREATE UNIQUE INDEX all_season_finishes_pk ON public.all_season_finishes (season, user_id);
CREATE INDEX all_season_finishes_user ON public.all_season_finishes (user_id);

CREATE VIEW public.season_entrant_counts AS
  SELECT season, count(*) AS entrants FROM public.all_season_finishes GROUP BY season;

CREATE MATERIALIZED VIEW public.player_career_stats AS
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
           t.best_finish_titles, t.lock_titles, t.weekly_wins;
CREATE UNIQUE INDEX player_career_stats_pk ON public.player_career_stats (user_id);

GRANT SELECT ON public.all_season_finishes  TO anon, authenticated;
GRANT SELECT ON public.season_entrant_counts TO anon, authenticated;
GRANT SELECT ON public.player_career_stats  TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_stats_views()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  REFRESH MATERIALIZED VIEW public.all_season_finishes;
  REFRESH MATERIALIZED VIEW public.player_career_stats;
$$;
