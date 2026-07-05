-- 175: Add precomputed rank columns to player_career_stats for the remaining
-- record boards (championships, weekly wins, top-10 finishes, seasons played),
-- so the History → Records page can show a logged-in user's "You: #N of {total}"
-- on EVERY board without extra queries and even when they're outside the top 100.
-- Migration 173 already added career_points/avg/win_pct/lock_win_pct/avg_finish ranks.

DROP MATERIALIZED VIEW IF EXISTS player_career_stats;

CREATE MATERIALIZED VIEW player_career_stats AS
  WITH base AS (
    SELECT f.user_id,
       u.display_name,
       count(*) AS seasons_played,
       sum(f.total_points) AS career_points,
       round(avg(f.total_points), 1) AS avg_season_points,
       sum(f.wins) AS career_wins,
       sum(f.losses) AS career_losses,
       sum(f.pushes) AS career_pushes,
       round((sum(f.wins) / NULLIF((sum(f.wins) + sum(f.losses)), (0)::numeric)), 4) AS win_pct,
       sum(f.lock_wins) AS career_lock_wins,
       sum(f.lock_losses) AS career_lock_losses,
       round((sum(f.lock_wins) / NULLIF((sum(f.lock_wins) + sum(f.lock_losses)), (0)::numeric)), 4) AS lock_win_pct,
       min(f.rank) AS best_finish,
       round(avg(f.rank), 1) AS avg_finish,
       max(f.total_points) AS best_season_points,
       count(*) FILTER (WHERE (f.rank <= 3)) AS top3_finishes,
       count(*) FILTER (WHERE (f.rank <= 10)) AS top10_finishes,
       COALESCE(t.championships, (0)::bigint) AS championships,
       COALESCE(t.runner_ups, (0)::bigint) AS runner_ups,
       COALESCE(t.best_finish_titles, (0)::bigint) AS best_finish_titles,
       COALESCE(t.lock_titles, (0)::bigint) AS lock_titles,
       COALESCE(t.weekly_wins, (0)::bigint) AS weekly_wins
      FROM ((all_season_finishes f
        JOIN users u ON ((u.id = f.user_id)))
        LEFT JOIN player_titles t ON ((t.user_id = f.user_id)))
     GROUP BY f.user_id, u.display_name, t.championships, t.runner_ups, t.best_finish_titles, t.lock_titles, t.weekly_wins
  )
  SELECT user_id,
     display_name,
     seasons_played,
     career_points,
     avg_season_points,
     career_wins,
     career_losses,
     career_pushes,
     win_pct,
     career_lock_wins,
     career_lock_losses,
     lock_win_pct,
     best_finish,
     avg_finish,
     best_season_points,
     top3_finishes,
     top10_finishes,
     championships,
     runner_ups,
     best_finish_titles,
     lock_titles,
     weekly_wins,
     count(*) OVER () AS total_players,
     rank() OVER (ORDER BY career_points DESC) AS career_points_rank,
     rank() OVER (ORDER BY avg_season_points DESC) AS avg_season_points_rank,
     rank() OVER (ORDER BY win_pct DESC NULLS LAST) AS win_pct_rank,
     rank() OVER (ORDER BY lock_win_pct DESC NULLS LAST) AS lock_win_pct_rank,
     rank() OVER (ORDER BY avg_finish) AS avg_finish_rank,
     rank() OVER (ORDER BY championships DESC) AS championships_rank,
     rank() OVER (ORDER BY weekly_wins DESC) AS weekly_wins_rank,
     rank() OVER (ORDER BY top10_finishes DESC) AS top10_finishes_rank,
     rank() OVER (ORDER BY seasons_played DESC) AS seasons_played_rank
    FROM base;

CREATE UNIQUE INDEX player_career_stats_pk ON public.player_career_stats USING btree (user_id);

GRANT SELECT ON public.player_career_stats TO anon, authenticated;
