-- 179: (a) add per-user rank + total to the fun person-analytics views so the
-- Records page can show "You: N (#rank of M)"; (b) add per-(season,week) slate
-- difficulty so we can surface the single hardest/easiest weeks in history.

CREATE OR REPLACE VIEW public.stat_perfect_weeks AS
  WITH pw AS (
    SELECT assigned_user_id AS user_id, season, week,
           count(*) AS picks,
           count(*) FILTER (WHERE result = 'win'::pick_result) AS wins
      FROM anonymous_picks
     WHERE season BETWEEN 2016 AND 2024 AND assigned_user_id IS NOT NULL AND result IS NOT NULL
     GROUP BY assigned_user_id, season, week
  ), agg AS (
    SELECT u.id AS user_id, u.display_name,
       count(*) FILTER (WHERE pw.picks >= 6 AND pw.wins = pw.picks) AS perfect_weeks,
       count(*) FILTER (WHERE pw.picks >= 6 AND pw.wins = 0) AS goose_weeks
      FROM pw JOIN users u ON u.id = pw.user_id
     GROUP BY u.id, u.display_name
  )
  SELECT user_id, display_name, perfect_weeks, goose_weeks,
     count(*) OVER () AS total_players,
     rank() OVER (ORDER BY perfect_weeks DESC) AS perfect_rank,
     rank() OVER (ORDER BY goose_weeks DESC) AS goose_rank
    FROM agg;

CREATE OR REPLACE VIEW public.stat_contrarian AS
  WITH side_counts AS (
    SELECT game_id, selected_team, count(*) AS c
      FROM anonymous_picks
     WHERE season BETWEEN 2016 AND 2024 AND result IS NOT NULL
     GROUP BY game_id, selected_team
  ),
  majority AS (
    SELECT DISTINCT ON (game_id) game_id, selected_team AS majority_team
      FROM side_counts ORDER BY game_id, c DESC
  ),
  totals AS (SELECT game_id, sum(c) AS tot FROM side_counts GROUP BY game_id),
  agg AS (
    SELECT u.id AS user_id, u.display_name,
       count(*) FILTER (WHERE ap.selected_team <> m.majority_team AND ap.result = 'win'::pick_result) AS contrarian_wins,
       count(*) FILTER (WHERE ap.selected_team <> m.majority_team) AS contrarian_picks
      FROM anonymous_picks ap
      JOIN majority m ON m.game_id = ap.game_id
      JOIN totals t ON t.game_id = ap.game_id
      JOIN users u ON u.id = ap.assigned_user_id
     WHERE ap.season BETWEEN 2016 AND 2024 AND ap.result IS NOT NULL
       AND ap.assigned_user_id IS NOT NULL AND t.tot >= 10
     GROUP BY u.id, u.display_name
  )
  SELECT user_id, display_name, contrarian_wins, contrarian_picks,
     count(*) OVER () AS total_players,
     rank() OVER (ORDER BY contrarian_wins DESC) AS contrarian_rank
    FROM agg;

-- Per-(season,week) field ATS difficulty — for all-time hardest/easiest slates.
CREATE OR REPLACE VIEW public.stat_week_slates AS
  SELECT season, week,
     count(*) FILTER (WHERE result = 'win'::pick_result) AS wins,
     count(*) FILTER (WHERE result = 'loss'::pick_result) AS losses,
     count(*) AS total_picks,
     round((count(*) FILTER (WHERE result = 'win'::pick_result))::numeric
       / NULLIF(count(*) FILTER (WHERE result = ANY (ARRAY['win'::pick_result,'loss'::pick_result])), 0)::numeric, 4) AS win_pct
    FROM anonymous_picks
   WHERE season BETWEEN 2016 AND 2024 AND result IS NOT NULL
   GROUP BY season, week
  HAVING count(*) >= 500;   -- only full slates

GRANT SELECT ON public.stat_perfect_weeks, public.stat_contrarian, public.stat_week_slates TO anon, authenticated;
