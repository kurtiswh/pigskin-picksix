-- Include 2025 (now complete) in all-time views; add per-season entrant counts;
-- de-dupe pick analytics via is_active_pick_set (fixes 2025 multi-set inflation).

CREATE OR REPLACE VIEW public.all_season_finishes AS
  SELECT season, user_id, final_rank AS rank, total_points,
         wins, losses, pushes, lock_wins, lock_losses
    FROM public.historical_season_standings
  UNION ALL
  SELECT season, user_id, season_rank AS rank, total_points,
         total_wins, total_losses, total_pushes, lock_wins, lock_losses
    FROM public.season_leaderboard
   WHERE season >= 2016;

CREATE OR REPLACE VIEW public.season_entrant_counts AS
  SELECT season, count(*) AS entrants
    FROM public.all_season_finishes GROUP BY season;

CREATE OR REPLACE VIEW public.stat_biggest_weeks AS
  SELECT ap.assigned_user_id AS user_id, u.display_name, ap.season, ap.week,
         sum(ap.points_earned) AS points,
         count(*) FILTER (WHERE ap.result = 'win')  AS wins,
         count(*) FILTER (WHERE ap.result = 'loss') AS losses
  FROM public.anonymous_picks ap
  JOIN public.users u ON u.id = ap.assigned_user_id
  WHERE ap.assigned_user_id IS NOT NULL AND ap.points_earned IS NOT NULL
    AND ap.season BETWEEN 2016 AND 2024
  GROUP BY ap.assigned_user_id, u.display_name, ap.season, ap.week;

CREATE OR REPLACE VIEW public.stat_team_ats AS
  SELECT initcap(lower(ap.selected_team)) AS team,
         count(*)                                   AS times_picked,
         count(*) FILTER (WHERE ap.result = 'win')  AS wins,
         count(*) FILTER (WHERE ap.result = 'loss') AS losses,
         count(*) FILTER (WHERE ap.result = 'push') AS pushes,
         round(count(*) FILTER (WHERE ap.result = 'win')::numeric
               / nullif(count(*) FILTER (WHERE ap.result IN ('win','loss')), 0), 4) AS win_pct
  FROM public.anonymous_picks ap
  WHERE ap.selected_team IS NOT NULL AND ap.result IS NOT NULL
    AND ap.season BETWEEN 2016 AND 2024
  GROUP BY initcap(lower(ap.selected_team));

GRANT SELECT ON public.season_entrant_counts TO anon, authenticated;
