-- Migration 222: when a player's Submit errors, the admin finds out
--
-- Carol Weeks pressed Submit, was told it worked (stale pre-fix bundle), and
-- her rows stayed submitted = false. The current client errors loudly at the
-- PLAYER on any zero-row or failed submit, but nothing told the COMMISSIONER;
-- discovery took a hand-query. This table is written by the pick sheet
-- whenever a submit or pick write throws, and Week Review reads it.
--
-- Deliberately append-only from the client: players can INSERT their own
-- failure records and nothing else; reading is admin-only through the RPC
-- (messages can quote backend errors).

CREATE TABLE IF NOT EXISTS public.submission_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week integer,
  season integer,
  stage text NOT NULL,     -- 'submit' | 'pick' | 'lock' | 'remove'
  message text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submission_failures_season_week
  ON public.submission_failures (season, week, created_at DESC);

ALTER TABLE public.submission_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS submission_failures_insert_own ON public.submission_failures;
CREATE POLICY submission_failures_insert_own ON public.submission_failures
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No SELECT/UPDATE/DELETE policies: reads go through the admin RPC below.

CREATE OR REPLACE FUNCTION public.wr_recent_submission_failures(
  p_week integer,
  p_season integer
)
RETURNS TABLE (
  display_name text,
  email text,
  stage text,
  message text,
  created_at timestamptz
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
    COALESCE(u.display_name, split_part(u.email, '@', 1)),
    lower(u.email),
    f.stage,
    left(f.message, 300),
    f.created_at
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
