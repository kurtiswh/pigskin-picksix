-- Ensure the app roles can read the historic/stats views (defensive; Supabase
-- default privileges usually cover this).
GRANT SELECT ON public.historical_season_standings TO anon, authenticated;
GRANT SELECT ON public.all_season_finishes    TO anon, authenticated;
GRANT SELECT ON public.player_titles           TO anon, authenticated;
GRANT SELECT ON public.player_career_stats     TO anon, authenticated;
GRANT SELECT ON public.stat_biggest_weeks      TO anon, authenticated;
GRANT SELECT ON public.stat_team_ats           TO anon, authenticated;
