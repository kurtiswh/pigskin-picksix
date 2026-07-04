-- Migration 158: standing scoring-verification view
--
-- Independently recomputes every completed game + pick from raw scores/spread
-- using the canonical rules (win=20, push=10, loss=0; margin bonus cover
-- >=29/+5, >=20/+3, >=11/+1; lock doubles the bonus only) and surfaces anything
-- where the STORED value disagrees, plus games stuck in a bad state.
--
-- This is the automated "is the scoring right?" check the weekly review process
-- will read. READ-ONLY (a view); touches no data. Returns zero rows for 2025 today.
--
-- Usage:  SELECT * FROM scoring_discrepancies WHERE season = <n>;

CREATE OR REPLACE VIEW public.scoring_discrepancies
WITH (security_invoker = false) AS
WITH g AS (
  SELECT id, season, week, home_team, away_team, home_score, away_score, spread,
         winner_against_spread, COALESCE(margin_bonus,0) AS margin_bonus, status,
    CASE WHEN (home_score + spread) > away_score THEN home_team
         WHEN away_score > (home_score + spread) THEN away_team
         ELSE 'push' END AS calc_winner,
    CASE WHEN ABS((home_score - away_score) + spread) >= 29 THEN 5
         WHEN ABS((home_score - away_score) + spread) >= 20 THEN 3
         WHEN ABS((home_score - away_score) + spread) >= 11 THEN 1
         ELSE 0 END AS calc_bonus
  FROM public.games
  WHERE status = 'completed' AND home_score IS NOT NULL AND away_score IS NOT NULL AND spread IS NOT NULL
),
pk AS (
  SELECT p.id, p.season, p.week, u.display_name AS label,
         p.result::text AS stored_res, p.points_earned AS stored_pts,
    CASE WHEN p.selected_team = g.calc_winner THEN 'win'
         WHEN g.calc_winner = 'push' THEN 'push' ELSE 'loss' END AS calc_res,
    CASE WHEN p.selected_team = g.calc_winner THEN 20 + g.calc_bonus + CASE WHEN p.is_lock THEN g.calc_bonus ELSE 0 END
         WHEN g.calc_winner = 'push' THEN 10 ELSE 0 END AS calc_pts
  FROM public.picks p JOIN g ON g.id = p.game_id JOIN public.users u ON u.id = p.user_id
),
ap AS (
  SELECT a.id, a.season, a.week, a.name AS label,
         a.result::text AS stored_res, a.points_earned AS stored_pts,
    CASE WHEN a.selected_team = g.calc_winner THEN 'win'
         WHEN g.calc_winner = 'push' THEN 'push' ELSE 'loss' END AS calc_res,
    CASE WHEN a.selected_team = g.calc_winner THEN 20 + g.calc_bonus + CASE WHEN a.is_lock THEN g.calc_bonus ELSE 0 END
         WHEN g.calc_winner = 'push' THEN 10 ELSE 0 END AS calc_pts
  FROM public.anonymous_picks a JOIN g ON g.id = a.game_id
)
SELECT 'game'::text AS kind, g.id AS ref_id, g.season, g.week,
       (g.away_team || ' @ ' || g.home_team) AS label,
       format('winner stored=%s calc=%s; bonus stored=%s calc=%s',
              COALESCE(g.winner_against_spread,'NULL'), g.calc_winner, g.margin_bonus, g.calc_bonus) AS issue
FROM g
WHERE g.winner_against_spread IS DISTINCT FROM g.calc_winner OR g.margin_bonus <> g.calc_bonus
UNION ALL
SELECT 'pick', pk.id, pk.season, pk.week, pk.label,
       format('result stored=%s calc=%s; pts stored=%s calc=%s',
              COALESCE(pk.stored_res,'NULL'), pk.calc_res, COALESCE(pk.stored_pts,-1), pk.calc_pts)
FROM pk
WHERE pk.stored_res IS DISTINCT FROM pk.calc_res OR COALESCE(pk.stored_pts,-1) <> pk.calc_pts
UNION ALL
SELECT 'anon_pick', ap.id, ap.season, ap.week, ap.label,
       format('result stored=%s calc=%s; pts stored=%s calc=%s',
              COALESCE(ap.stored_res,'NULL'), ap.calc_res, COALESCE(ap.stored_pts,-1), ap.calc_pts)
FROM ap
WHERE ap.stored_res IS DISTINCT FROM ap.calc_res OR COALESCE(ap.stored_pts,-1) <> ap.calc_pts
UNION ALL
SELECT 'game_state', gg.id, gg.season, gg.week, (gg.away_team || ' @ ' || gg.home_team),
       CASE WHEN gg.status='completed' AND gg.winner_against_spread IS NULL THEN 'completed but not scored'
            ELSE 'has scores but not marked completed' END
FROM public.games gg
WHERE (gg.status='completed' AND gg.winner_against_spread IS NULL AND gg.home_score IS NOT NULL)
   OR (gg.status<>'completed' AND gg.home_score IS NOT NULL AND gg.away_score IS NOT NULL);

GRANT SELECT ON public.scoring_discrepancies TO authenticated;
