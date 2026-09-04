-- Migration 221: surface "picks in, never submitted" to the commissioner
--
-- A player on a stale pre-fix bundle could click Submit, be told it worked,
-- and leave rows with submitted = false (Carol Weeks, 2026-09-04; her
-- pick_reminder jobs from Sep 1-2 are still pending, proving her earlier
-- submits never ran the post-submit flow). Current code errors loudly on a
-- zero-row submit, but nothing told the ADMIN who was sitting in that state:
-- 8 complete sheets (6 picks + a lock) were unsubmitted two days before the
-- deadline and invisible except by hand-querying.
--
-- Admin-gated like its siblings: it returns emails.

CREATE OR REPLACE FUNCTION public.wr_unsubmitted_entries(
  p_week integer,
  p_season integer
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  picks bigint,
  has_lock boolean,
  complete boolean,
  last_touch timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_admin_or_server();

  RETURN QUERY
  SELECT
    u.id,
    COALESCE(u.display_name, split_part(u.email, '@', 1)),
    lower(u.email),
    count(*),
    bool_or(p.is_lock),
    (count(*) = 6 AND bool_or(p.is_lock)) AS complete,
    max(p.created_at) AS last_touch  -- created_at: scoring passes bump updated_at for everyone
  FROM public.picks p
  JOIN public.users u ON u.id = p.user_id
  WHERE p.season = p_season AND p.week = p_week
  GROUP BY u.id, u.display_name, u.email
  HAVING count(*) FILTER (WHERE p.submitted) = 0
  ORDER BY (count(*) = 6 AND bool_or(p.is_lock)) DESC, max(p.created_at) DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_unsubmitted_entries(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_unsubmitted_entries(integer, integer) TO authenticated, service_role;
