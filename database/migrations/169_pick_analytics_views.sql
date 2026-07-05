-- Advanced pick analytics from anonymous_picks (completed pick-level seasons 2016-2024).

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

-- Team ATS performance when picked; team names normalized to one case so
-- "OKLAHOMA STATE"/"Oklahoma State" merge (source names are workbook-verbatim).
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
