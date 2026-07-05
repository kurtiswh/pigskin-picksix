-- Migration 167: weekly recap seeding (Part B feature)
--
-- Two SECURITY DEFINER analytics functions + an email-tracking column:
--   * wr_recap_seed(week, season)      -> jsonb pack of the week's outliers for
--     the admin's recap panel / auto-draft (headline numbers, storylines, and a
--     per-game table WITH point totals by game).
--   * wr_recap_recipients(week, season) -> one row per paid entrant with their
--     personalized week block (record, points, season rank + prior-week rank for
--     movement, and their picks with per-game points). Drives the personalized
--     "email to players" send (and the test-to-self, by filtering to one user).
--   * blog_posts.emailed_at             -> so a recap can't be emailed twice.
--
-- "Counted" picks = submitted, not disqualified, by a Paid entrant for the season.
-- Reads stored p.result / p.points_earned (already scored by the canonical path).

ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

-- ── Recap seed (one jsonb blob) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wr_recap_seed(p_week integer, p_season integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  seed jsonb;
BEGIN
  WITH wp AS (
    SELECT p.user_id, p.selected_team, p.is_lock, p.result::text AS result, p.points_earned,
           g.id AS game_id, g.home_team, g.away_team, g.winner_against_spread AS winner,
           COALESCE(g.margin_bonus,0) AS margin_bonus, g.kickoff_time
    FROM picks p
    JOIN games g ON g.id = p.game_id
    WHERE p.season=p_season AND p.week=p_week AND p.submitted=true AND NOT p.disqualified
      AND EXISTS (SELECT 1 FROM leaguesafe_payments lp WHERE lp.user_id=p.user_id AND lp.season=p_season AND lp.status='Paid')
  ),
  grp AS (
    SELECT count(*) FILTER (WHERE result='win') AS wins,
           count(*) FILTER (WHERE result='loss') AS losses,
           count(*) FILTER (WHERE result='win'  AND is_lock) AS lock_wins,
           count(*) FILTER (WHERE result='loss' AND is_lock) AS lock_losses,
           count(*) FILTER (WHERE is_lock) AS lock_total
    FROM wp
  ),
  per_user AS (
    SELECT user_id,
           count(*) FILTER (WHERE result='win')  AS w,
           count(*) FILTER (WHERE result='loss') AS l
    FROM wp GROUP BY user_id
  ),
  gpick AS (
    SELECT g.id AS game_id, g.away_team, g.home_team, g.winner_against_spread AS winner,
           COALESCE(g.margin_bonus,0) AS margin_bonus,
           count(wp.user_id) AS total,
           count(*) FILTER (WHERE wp.selected_team=g.away_team) AS away_picks,
           count(*) FILTER (WHERE wp.selected_team=g.home_team) AS home_picks,
           count(*) FILTER (WHERE wp.is_lock) AS locks,
           count(*) FILTER (WHERE wp.is_lock AND wp.result='win')  AS lock_wins,
           count(*) FILTER (WHERE wp.is_lock AND wp.result='loss') AS lock_losses,
           min(g.kickoff_time) AS kickoff_time
    FROM games g JOIN wp ON wp.game_id=g.id
    WHERE g.season=p_season AND g.week=p_week
    GROUP BY g.id, g.away_team, g.home_team, g.winner_against_spread, g.margin_bonus
  )
  SELECT jsonb_build_object(
    'week', p_week, 'season', p_season,
    'winners', COALESCE((SELECT jsonb_agg(jsonb_build_object('name',display_name,'points',total_points))
                         FROM weekly_leaderboard WHERE season=p_season AND week=p_week AND weekly_rank=1), '[]'::jsonb),
    'group_wins', (SELECT wins FROM grp), 'group_losses', (SELECT losses FROM grp),
    'group_win_pct', (SELECT round(100.0*wins/NULLIF(wins+losses,0),1) FROM grp),
    'lock_hits', (SELECT lock_wins FROM grp), 'lock_total', (SELECT lock_total FROM grp),
    'lock_win_pct', (SELECT round(100.0*lock_wins/NULLIF(lock_wins+lock_losses,0),1) FROM grp),
    'entrants', (SELECT count(*) FROM per_user),
    'perfect_count', (SELECT count(*) FROM per_user WHERE w=6 AND l=0),
    'perfect', COALESCE((SELECT jsonb_agg(u.display_name) FROM per_user pu JOIN users u ON u.id=pu.user_id WHERE pu.w=6 AND pu.l=0), '[]'::jsonb),
    'winless_count', (SELECT count(*) FROM per_user WHERE l=6 AND w=0),
    'winless', COALESCE((SELECT jsonb_agg(u.display_name) FROM per_user pu JOIN users u ON u.id=pu.user_id WHERE pu.l=6 AND pu.w=0), '[]'::jsonb),
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
      FROM season_leaderboard WHERE season=p_season AND season_rank=1 LIMIT 1),
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
$$;

GRANT EXECUTE ON FUNCTION public.wr_recap_seed(integer, integer) TO authenticated;

-- ── Recap recipients + personalized blocks ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.wr_recap_recipients(p_week integer, p_season integer)
RETURNS TABLE(user_id uuid, email text, display_name text, block jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH paid AS (
    SELECT DISTINCT p.user_id
    FROM picks p
    WHERE p.season=p_season AND p.week=p_week AND p.submitted=true AND NOT p.disqualified
      AND EXISTS (SELECT 1 FROM leaguesafe_payments lp WHERE lp.user_id=p.user_id AND lp.season=p_season AND lp.status='Paid')
  ),
  cum AS (
    SELECT p.user_id,
           sum(p.points_earned) FILTER (WHERE p.week<=p_week)   AS pts_n,
           sum(p.points_earned) FILTER (WHERE p.week<=p_week-1) AS pts_prev
    FROM picks p
    WHERE p.season=p_season AND p.submitted=true AND NOT p.disqualified
      AND EXISTS (SELECT 1 FROM leaguesafe_payments lp WHERE lp.user_id=p.user_id AND lp.season=p_season AND lp.status='Paid')
    GROUP BY p.user_id
  ),
  ranked AS (
    SELECT user_id,
           rank() OVER (ORDER BY COALESCE(pts_n,0)    DESC) AS rank_n,
           rank() OVER (ORDER BY COALESCE(pts_prev,0) DESC) AS rank_prev
    FROM cum
  ),
  mp AS (
    SELECT p.user_id,
           jsonb_agg(jsonb_build_object('team',p.selected_team,'is_lock',p.is_lock,
             'result',p.result::text,'points',p.points_earned,
             'game',g.away_team||' @ '||g.home_team) ORDER BY g.kickoff_time) AS picks,
           count(*) FILTER (WHERE p.result='win')  AS wins,
           count(*) FILTER (WHERE p.result='loss') AS losses,
           count(*) FILTER (WHERE p.result='push') AS pushes,
           COALESCE(sum(p.points_earned),0) AS points
    FROM picks p JOIN games g ON g.id=p.game_id
    WHERE p.season=p_season AND p.week=p_week AND p.submitted=true AND NOT p.disqualified
    GROUP BY p.user_id
  )
  SELECT pd.user_id, u.email, u.display_name,
    jsonb_build_object(
      'wins', COALESCE(mp.wins,0), 'losses', COALESCE(mp.losses,0), 'pushes', COALESCE(mp.pushes,0),
      'points', COALESCE(mp.points,0),
      'season_rank', r.rank_n, 'season_rank_prev', r.rank_prev,
      'picks', COALESCE(mp.picks, '[]'::jsonb)
    )
  FROM paid pd
  JOIN users u ON u.id=pd.user_id
  LEFT JOIN mp ON mp.user_id=pd.user_id
  LEFT JOIN ranked r ON r.user_id=pd.user_id
  ORDER BY u.display_name;
$$;

GRANT EXECUTE ON FUNCTION public.wr_recap_recipients(integer, integer) TO authenticated;
