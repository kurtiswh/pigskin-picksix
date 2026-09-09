-- Migration 241: the payment gate has to count anonymous entries too
--
-- wr_unpaid_submitters reads only the picks table, so a player whose entry
-- arrived as an anonymous submission is invisible to it however plainly they
-- are being scored. Week 1 of 2026: 31 players hold a sheet with no paid
-- entry behind it, the Payment gate row showed 24, and the 7 it could not see
-- -- Bryce Howe, Cara Capra, RYAN MCDANIEL, Tanner Calloway among them -- are
-- on the leaderboard on the same terms as everyone else.
--
-- Count both sources, the same two the leaderboard counts: a submitted
-- account sheet, or an anonymous entry tied to the account and shown. Merged
-- tombstones are excluded, as everywhere else. pick_count is now the sum
-- across both, which is what "how much of a sheet do they have" means when an
-- entry can arrive either way.

CREATE OR REPLACE FUNCTION public.wr_unpaid_submitters(p_week integer, p_season integer)
RETURNS TABLE(user_id uuid, display_name text, email text, pick_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH sheets AS (
    SELECT p.user_id AS uid
    FROM public.picks p
    WHERE p.season = p_season AND p.week = p_week AND p.submitted = true

    UNION ALL

    SELECT ap.assigned_user_id
    FROM public.anonymous_picks ap
    WHERE ap.season = p_season AND ap.week = p_week
      AND ap.assigned_user_id IS NOT NULL
      AND ap.show_on_leaderboard = true
  )
  SELECT s.uid, u.display_name, u.email, count(*) AS pick_count
  FROM sheets s
  JOIN public.users u ON u.id = s.uid
  WHERE u.email NOT LIKE '%\_merged\_%'
    AND NOT EXISTS (
      SELECT 1 FROM public.leaguesafe_payments lp
      WHERE lp.user_id = s.uid AND lp.season = p_season AND lp.status = 'Paid'
    )
  GROUP BY s.uid, u.display_name, u.email
  ORDER BY u.display_name;
$function$;

REVOKE ALL ON FUNCTION public.wr_unpaid_submitters(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_unpaid_submitters(integer, integer) TO authenticated, service_role;
