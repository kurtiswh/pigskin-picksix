-- 177: Three new "fun" pick-analytics views over historical picks (2016-2024,
-- the seasons with game/pick-level detail in anonymous_picks).

-- (1) Perfect weeks (all picks won) and goose eggs (zero wins) per player.
CREATE OR REPLACE VIEW public.stat_perfect_weeks AS
  WITH pw AS (
    SELECT assigned_user_id AS user_id, season, week,
           count(*) AS picks,
           count(*) FILTER (WHERE result = 'win'::pick_result) AS wins
      FROM anonymous_picks
     WHERE season BETWEEN 2016 AND 2024
       AND assigned_user_id IS NOT NULL
       AND result IS NOT NULL
     GROUP BY assigned_user_id, season, week
  )
  SELECT u.id AS user_id, u.display_name,
     count(*) FILTER (WHERE pw.picks >= 6 AND pw.wins = pw.picks) AS perfect_weeks,
     count(*) FILTER (WHERE pw.picks >= 6 AND pw.wins = 0) AS goose_weeks
    FROM pw JOIN users u ON u.id = pw.user_id
   GROUP BY u.id, u.display_name;

-- (2) Contrarian king: correct picks made AGAINST the field's majority side.
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
  totals AS (SELECT game_id, sum(c) AS tot FROM side_counts GROUP BY game_id)
  SELECT u.id AS user_id, u.display_name,
     count(*) FILTER (WHERE ap.selected_team <> m.majority_team AND ap.result = 'win'::pick_result) AS contrarian_wins,
     count(*) FILTER (WHERE ap.selected_team <> m.majority_team) AS contrarian_picks
    FROM anonymous_picks ap
    JOIN majority m ON m.game_id = ap.game_id
    JOIN totals t ON t.game_id = ap.game_id
    JOIN users u ON u.id = ap.assigned_user_id
   WHERE ap.season BETWEEN 2016 AND 2024
     AND ap.result IS NOT NULL
     AND ap.assigned_user_id IS NOT NULL
     AND t.tot >= 10               -- only games with a real crowd
   GROUP BY u.id, u.display_name;

-- (3) Hardest weeks: field-wide ATS win% by week number across all seasons.
CREATE OR REPLACE VIEW public.stat_week_difficulty AS
  SELECT week,
     count(*) FILTER (WHERE result = 'win'::pick_result) AS wins,
     count(*) FILTER (WHERE result = 'loss'::pick_result) AS losses,
     count(*) FILTER (WHERE result = 'push'::pick_result) AS pushes,
     count(*) AS total_picks,
     round((count(*) FILTER (WHERE result = 'win'::pick_result))::numeric
       / NULLIF(count(*) FILTER (WHERE result = ANY (ARRAY['win'::pick_result,'loss'::pick_result])), 0)::numeric, 4) AS win_pct
    FROM anonymous_picks
   WHERE season BETWEEN 2016 AND 2024 AND result IS NOT NULL
   GROUP BY week;

GRANT SELECT ON public.stat_perfect_weeks, public.stat_contrarian, public.stat_week_difficulty TO anon, authenticated;
