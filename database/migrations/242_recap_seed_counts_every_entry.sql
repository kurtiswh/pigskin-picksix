-- Migration 242: the weekly recap has to count the entries the leaderboard counts
--
-- wr_recap_seed built every statistic from the picks table alone, submitted and
-- with a Paid entry. Two whole classes of entry were therefore missing from it:
-- an anonymous submission, however plainly it is being scored, and a player
-- inside the grace period who has not paid yet. The winner line came from
-- weekly_leaderboard, which counts both, so the recap contradicted itself in
-- public: week 1 of 2026 named Randy Moore the winner on 122 points and then
-- reported 0 perfect sheets, because his counted sheet is an anonymous entry
-- and his account sheet was never submitted.
--
--   entrants      580 -> 651
--   perfect         0 -> 1
--   group record  1430-1733 -> 1612-1938
--   lock hits     204 -> 225
--
-- Player-level figures now come straight from weekly_leaderboard, so the recap
-- and the published standings cannot disagree by construction -- one place
-- decides who counts and with what record. Only the per-game distribution
-- (pick share, locks per game, best and worst lock) needs pick-level rows, and
-- that CTE applies the same precedence the view does: a submitted account sheet
-- takes the week, an anonymous entry counts when there is none, merged
-- tombstones are excluded, and the payment gate honours the grace period.
--
-- Anonymous results are derived from games.winner_against_spread, the column
-- Part A made canonical, rather than the stored per-pick result.

CREATE OR REPLACE FUNCTION public.wr_recap_seed(p_week integer, p_season integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  seed jsonb;
BEGIN
  WITH board AS (
    SELECT * FROM public.weekly_leaderboard
    WHERE season = p_season AND week = p_week
  ),
  grace AS (SELECT grace_period_weeks AS wks FROM public.app_settings LIMIT 1),
  wp AS (
    SELECT p.user_id, p.selected_team, p.is_lock, p.result::text AS result,
           g.id AS game_id, g.home_team, g.away_team,
           g.winner_against_spread AS winner,
           COALESCE(g.margin_bonus, 0) AS margin_bonus, g.kickoff_time
    FROM public.picks p
    JOIN public.games g ON g.id = p.game_id
    JOIN public.users u ON u.id = p.user_id
    WHERE p.season = p_season AND p.week = p_week
      AND p.submitted = true AND p.show_on_leaderboard = true AND NOT p.disqualified
      AND u.email NOT LIKE '%\_merged\_%'
      AND (EXISTS (SELECT 1 FROM public.leaguesafe_payments lp
                   WHERE lp.user_id = p.user_id AND lp.season = p_season AND lp.status = 'Paid')
           OR p_week <= (SELECT wks FROM grace))

    UNION ALL

    SELECT ap.assigned_user_id, ap.selected_team, ap.is_lock,
           CASE
             WHEN g.winner_against_spread IS NULL THEN NULL
             WHEN g.winner_against_spread = 'push' THEN 'push'
             WHEN ap.selected_team = g.winner_against_spread THEN 'win'
             ELSE 'loss'
           END,
           g.id, g.home_team, g.away_team,
           g.winner_against_spread,
           COALESCE(g.margin_bonus, 0), g.kickoff_time
    FROM public.anonymous_picks ap
    JOIN public.games g ON g.id = ap.game_id
    JOIN public.users u ON u.id = ap.assigned_user_id
    WHERE ap.season = p_season AND ap.week = p_week
      AND ap.show_on_leaderboard = true AND NOT COALESCE(ap.disqualified, false)
      AND u.email NOT LIKE '%\_merged\_%'
      AND (EXISTS (SELECT 1 FROM public.leaguesafe_payments lp
                   WHERE lp.user_id = ap.assigned_user_id AND lp.season = p_season AND lp.status = 'Paid')
           OR p_week <= (SELECT wks FROM grace))
      AND NOT EXISTS (
        SELECT 1 FROM public.picks p
        WHERE p.user_id = ap.assigned_user_id AND p.week = ap.week AND p.season = ap.season
          AND p.submitted = true AND p.show_on_leaderboard = true)
  ),
  gpick AS (
    SELECT g.id AS game_id, g.away_team, g.home_team, g.winner_against_spread AS winner,
           COALESCE(g.margin_bonus, 0) AS margin_bonus,
           count(wp.user_id) AS total,
           count(*) FILTER (WHERE wp.selected_team = g.away_team) AS away_picks,
           count(*) FILTER (WHERE wp.selected_team = g.home_team) AS home_picks,
           count(*) FILTER (WHERE wp.is_lock) AS locks,
           count(*) FILTER (WHERE wp.is_lock AND wp.result = 'win')  AS lock_wins,
           count(*) FILTER (WHERE wp.is_lock AND wp.result = 'loss') AS lock_losses,
           min(g.kickoff_time) AS kickoff_time
    FROM public.games g
    JOIN wp ON wp.game_id = g.id
    WHERE g.season = p_season AND g.week = p_week
    GROUP BY g.id, g.away_team, g.home_team, g.winner_against_spread, g.margin_bonus
  )
  SELECT jsonb_build_object(
    'week', p_week, 'season', p_season,
    'winners', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', display_name, 'points', total_points))
                         FROM board WHERE weekly_rank = 1), '[]'::jsonb),
    'group_wins',    (SELECT COALESCE(sum(wins), 0) FROM board),
    'group_losses',  (SELECT COALESCE(sum(losses), 0) FROM board),
    'group_win_pct', (SELECT round(100.0 * sum(wins) / NULLIF(sum(wins) + sum(losses), 0), 1) FROM board),
    'lock_hits',     (SELECT COALESCE(sum(lock_wins), 0) FROM board),
    'lock_total',    (SELECT COALESCE(sum(lock_wins + lock_losses + lock_pushes), 0) FROM board),
    'lock_win_pct',  (SELECT round(100.0 * sum(lock_wins) / NULLIF(sum(lock_wins) + sum(lock_losses), 0), 1) FROM board),
    'entrants',      (SELECT count(*) FROM board),
    'perfect_count', (SELECT count(*) FROM board WHERE wins = 6 AND losses = 0),
    'perfect', COALESCE((SELECT jsonb_agg(display_name) FROM board WHERE wins = 6 AND losses = 0), '[]'::jsonb),
    'winless_count', (SELECT count(*) FROM board WHERE losses = 6 AND wins = 0),
    'winless', COALESCE((SELECT jsonb_agg(display_name) FROM board WHERE losses = 6 AND wins = 0), '[]'::jsonb),
    'biggest_upset', (SELECT jsonb_build_object('game', away_team||' @ '||home_team, 'team', winner,
        'pick_pct', round(100.0*(CASE WHEN winner=away_team THEN away_picks ELSE home_picks END)/NULLIF(total,0),1))
      FROM gpick WHERE winner IS NOT NULL AND winner<>'push' AND total>0
      ORDER BY (CASE WHEN winner=away_team THEN away_picks ELSE home_picks END)::numeric/NULLIF(total,0) ASC LIMIT 1),
    'biggest_crowd_miss', (SELECT jsonb_build_object('game', away_team||' @ '||home_team,
        'team', CASE WHEN away_picks>=home_picks THEN away_team ELSE home_team END,
        'pick_pct', round(100.0*GREATEST(away_picks,home_picks)/NULLIF(total,0),1))
      FROM gpick WHERE winner IS NOT NULL AND winner<>'push' AND total>0
        AND (CASE WHEN away_picks>=home_picks THEN away_team ELSE home_team END) <> winner
      ORDER BY GREATEST(away_picks,home_picks)::numeric/NULLIF(total,0) DESC LIMIT 1),
    'best_lock', (SELECT jsonb_build_object('game', away_team||' @ '||home_team, 'team', winner, 'wins', lock_wins)
      FROM gpick WHERE lock_wins>0 ORDER BY lock_wins DESC LIMIT 1),
    'worst_lock', (SELECT jsonb_build_object('game', away_team||' @ '||home_team, 'losses', lock_losses)
      FROM gpick WHERE lock_losses>0 ORDER BY lock_losses DESC LIMIT 1),
    'biggest_cover', (SELECT jsonb_build_object('game', away_team||' @ '||home_team, 'team', winner, 'bonus', margin_bonus)
      FROM gpick WHERE winner IS NOT NULL AND winner<>'push' AND margin_bonus>0 ORDER BY margin_bonus DESC LIMIT 1),
    'season_leader', (SELECT jsonb_build_object('name', display_name, 'points', total_points)
      FROM public.season_leaderboard WHERE season=p_season AND season_rank=1 LIMIT 1),
    'games', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'game', away_team||' @ '||home_team,
        'away_pct', round(100.0*away_picks/NULLIF(total,0)),
        'home_pct', round(100.0*home_picks/NULLIF(total,0)),
        'locks', locks, 'winner', winner,
        'win_pts', CASE WHEN winner='push' THEN 10 ELSE 20+margin_bonus END,
        'lock_win_pts', CASE WHEN winner='push' THEN 10 ELSE 20+2*margin_bonus END
      ) ORDER BY kickoff_time) FROM gpick), '[]'::jsonb)
  ) INTO seed;
  RETURN seed;
END;
$function$;
