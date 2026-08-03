-- Migration 183: weekly recap also reaches paid players who sat the week out
--
-- PROBLEM:
--   wr_recap_recipients() built its recipient list from picks submitted THAT
--   week, so anyone who forgot to play got no recap at all — exactly the people
--   most worth nudging back. They silently fell out of the weekly touchpoint.
--
-- FIX:
--   Recipients = every paid entrant for the season. A new block flag `played`
--   tells the email builder which variant to render (results card vs. the
--   "you missed one" nudge). Rank fields stay null for non-players, which the
--   template already handles. Also skips users with no email address, which
--   previously counted as send failures.

CREATE OR REPLACE FUNCTION public.wr_recap_recipients(p_week integer, p_season integer)
RETURNS TABLE(user_id uuid, email text, display_name text, block jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH paid AS (
    -- Every paid entrant for the season, whether or not they played this week.
    SELECT DISTINCT lp.user_id
    FROM leaguesafe_payments lp
    WHERE lp.season = p_season AND lp.status = 'Paid' AND lp.user_id IS NOT NULL
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
      'played', (mp.user_id IS NOT NULL),
      'wins', COALESCE(mp.wins,0), 'losses', COALESCE(mp.losses,0), 'pushes', COALESCE(mp.pushes,0),
      'points', COALESCE(mp.points,0),
      'season_rank', r.rank_n, 'season_rank_prev', r.rank_prev,
      'picks', COALESCE(mp.picks, '[]'::jsonb)
    )
  FROM paid pd
  JOIN users u ON u.id=pd.user_id
  LEFT JOIN mp ON mp.user_id=pd.user_id
  LEFT JOIN ranked r ON r.user_id=pd.user_id
  WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
  ORDER BY u.display_name;
$function$;
