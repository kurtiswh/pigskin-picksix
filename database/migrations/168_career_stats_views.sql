-- All-time / career stats built on historical_season_standings (2006-2015) +
-- season_leaderboard (2016+) + season_winners (titles).

-- Every player's finish in every season, unified.
CREATE OR REPLACE VIEW public.all_season_finishes AS
  SELECT season, user_id, final_rank AS rank, total_points,
         wins, losses, pushes, lock_wins, lock_losses
    FROM public.historical_season_standings
  UNION ALL
  SELECT season, user_id, season_rank AS rank, total_points,
         total_wins, total_losses, total_pushes, lock_wins, lock_losses
    FROM public.season_leaderboard
   WHERE season BETWEEN 2016 AND 2024;

-- Titles from season_winners (point champ, runner-up, best finish, lock, weekly).
CREATE OR REPLACE VIEW public.player_titles AS
  WITH t AS (
    SELECT point_winner_user_id AS uid, 'champion' k FROM public.season_winners WHERE point_winner_user_id IS NOT NULL
    UNION ALL SELECT point_second_user_id, 'runner_up' FROM public.season_winners WHERE point_second_user_id IS NOT NULL
    UNION ALL SELECT best_finish_user_id, 'best_finish' FROM public.season_winners WHERE best_finish_user_id IS NOT NULL
    UNION ALL SELECT lock_winner_user_id, 'lock' FROM public.season_winners WHERE lock_winner_user_id IS NOT NULL
    UNION ALL SELECT (w->>'user_id')::uuid, 'weekly'
      FROM public.season_winners sw, jsonb_array_elements(COALESCE(sw.weekly_winners,'[]'::jsonb)) w
      WHERE (w->>'user_id') IS NOT NULL
  )
  SELECT uid AS user_id,
    count(*) FILTER (WHERE k='champion')    AS championships,
    count(*) FILTER (WHERE k='runner_up')   AS runner_ups,
    count(*) FILTER (WHERE k='best_finish') AS best_finish_titles,
    count(*) FILTER (WHERE k='lock')        AS lock_titles,
    count(*) FILTER (WHERE k='weekly')      AS weekly_wins
  FROM t GROUP BY uid;

-- One row per player: career totals + titles.
CREATE OR REPLACE VIEW public.player_career_stats AS
  SELECT
    f.user_id,
    u.display_name,
    count(*)                                   AS seasons_played,
    sum(f.total_points)                        AS career_points,
    round(avg(f.total_points), 1)              AS avg_season_points,
    sum(f.wins)                                AS career_wins,
    sum(f.losses)                              AS career_losses,
    sum(f.pushes)                              AS career_pushes,
    round(sum(f.wins)::numeric / nullif(sum(f.wins) + sum(f.losses), 0), 4) AS win_pct,
    sum(f.lock_wins)                           AS career_lock_wins,
    sum(f.lock_losses)                         AS career_lock_losses,
    round(sum(f.lock_wins)::numeric / nullif(sum(f.lock_wins) + sum(f.lock_losses), 0), 4) AS lock_win_pct,
    min(f.rank)                                AS best_finish,
    round(avg(f.rank), 1)                      AS avg_finish,
    max(f.total_points)                        AS best_season_points,
    count(*) FILTER (WHERE f.rank <= 3)        AS top3_finishes,
    count(*) FILTER (WHERE f.rank <= 10)       AS top10_finishes,
    COALESCE(t.championships, 0)               AS championships,
    COALESCE(t.runner_ups, 0)                  AS runner_ups,
    COALESCE(t.best_finish_titles, 0)          AS best_finish_titles,
    COALESCE(t.lock_titles, 0)                 AS lock_titles,
    COALESCE(t.weekly_wins, 0)                 AS weekly_wins
  FROM public.all_season_finishes f
  JOIN public.users u ON u.id = f.user_id
  LEFT JOIN public.player_titles t ON t.user_id = f.user_id
  GROUP BY f.user_id, u.display_name, t.championships, t.runner_ups,
           t.best_finish_titles, t.lock_titles, t.weekly_wins;
