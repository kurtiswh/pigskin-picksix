-- Migration 248: say whether a failed submit attempt was ever resolved
--
-- Week 3 recorded six failed attempts and every one of those players ended up
-- with a sheet in. The panel still read "🚨 6 failed submit attempts" with no
-- way to tell that from six players locked out, so the alarm cost a manual
-- check to dismiss. Return the outcome alongside the failure.
--
-- Resolved is per player, not per attempt: a player who errored twice and then
-- submitted is resolved on both rows. The question the commissioner is asking
-- is "does anyone still need help", not "did this particular click succeed".
--
-- user_id comes back too so the caller can join by id. CLAUDE.md is explicit
-- that turning an address into an account is what split 23 players in 2026, so
-- the client must not have to match these rows up by email.

DROP FUNCTION IF EXISTS public.wr_recent_submission_failures(integer, integer);

CREATE FUNCTION public.wr_recent_submission_failures(
  p_week integer,
  p_season integer
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  stage text,
  message text,
  created_at timestamptz,
  -- the player has a submitted sheet for the week, under their account or as a
  -- tied anonymous entry: the attempt below was retried and went through
  resolved boolean,
  -- picks on file but never sent, so they are sitting in the unsubmitted queue
  has_unsubmitted boolean
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
    f.user_id,
    COALESCE(u.display_name, split_part(u.email, '@', 1)),
    lower(u.email),
    f.stage,
    left(f.message, 300),
    f.created_at,
    (EXISTS (
       SELECT 1 FROM public.picks p
       WHERE p.user_id = f.user_id AND p.season = p_season AND p.week = p_week
         AND p.submitted = true
     )
     OR EXISTS (
       SELECT 1 FROM public.anonymous_picks ap
       WHERE ap.assigned_user_id = f.user_id AND ap.season = p_season AND ap.week = p_week
         AND ap.submitted = true
     )),
    EXISTS (
      SELECT 1 FROM public.picks p
      WHERE p.user_id = f.user_id AND p.season = p_season AND p.week = p_week
        AND p.submitted = false
    )
  FROM public.submission_failures f
  JOIN public.users u ON u.id = f.user_id
  WHERE f.season = p_season AND f.week = p_week
    AND f.created_at > now() - interval '14 days'
  ORDER BY f.created_at DESC
  LIMIT 50;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_recent_submission_failures(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_recent_submission_failures(integer, integer) TO authenticated, service_role;
