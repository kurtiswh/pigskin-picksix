-- Migration 232: flag on the rule that actually matters -- was it SUBMITTED?
--
-- A post-lock change is only a problem if the player had an ENTRY at that
-- moment. An unsubmitted pick is a draft: removing it and choosing a
-- still-open game is the correct move, not an exploit.
--
-- blocks_submission previously approximated this with "is the pick still in
-- the sheet". That gives the right answer for the five known cases but is
-- wrong in principle, and wrong in one real scenario: a player who HAS
-- submitted and then deletes a locked pick after seeing the result would be
-- excused, because the pick is gone. That is precisely the case that should
-- be caught.
--
-- Reconstructing submitted-state-at-a-moment needs two sources. pick_change_log
-- records submitted/unsubmitted but only since 2026-09-04; before that, a sent
-- picks_submitted email is the surviving evidence that a sheet was submitted.
-- Latest event at or before the moment wins.

CREATE OR REPLACE FUNCTION public.sheet_was_submitted_at(
  p_user uuid,
  p_week integer,
  p_season integer,
  p_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (
      SELECT e.is_submit
      FROM (
        SELECT l.changed_at AS at, (l.change_type = 'submitted') AS is_submit
        FROM public.pick_change_log l
        WHERE l.user_id = p_user AND l.week = p_week AND l.season = p_season
          AND l.change_type IN ('submitted','unsubmitted')
        UNION ALL
        -- Pre-log evidence: a confirmation was only ever queued for a real
        -- submission, so its timestamp is a submit event.
        SELECT j.created_at, true
        FROM public.email_jobs j
        WHERE j.user_id = p_user
          AND j.template_type = 'picks_submitted'
          AND COALESCE(j.week,   (j.payload->>'week')::int)   = p_week
          AND COALESCE(j.season, (j.payload->>'season')::int) = p_season
      ) e
      WHERE e.at <= p_at
      ORDER BY e.at DESC
      LIMIT 1
    ),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.sheet_was_submitted_at(uuid,integer,integer,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sheet_was_submitted_at(uuid,integer,integer,timestamptz) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.wr_pick_change_log(integer, integer, boolean);

CREATE FUNCTION public.wr_pick_change_log(
  p_week integer,
  p_season integer,
  p_flagged_only boolean DEFAULT false
)
RETURNS TABLE (
  display_name text, email text, matchup text, change_type text,
  old_value text, new_value text, changed_at timestamptz,
  after_kickoff boolean, after_deadline boolean, by_owner boolean,
  blocks_submission boolean, was_submitted boolean
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
    COALESCE(u.display_name, split_part(u.email,'@',1)),
    lower(u.email),
    COALESCE(g.away_team||' @ '||g.home_team, '(unknown game)'),
    l.change_type, l.old_value, l.new_value, l.changed_at,
    COALESCE(l.after_kickoff,false), COALESCE(l.after_deadline,false),
    COALESCE(l.actor_is_owner,false),
    (
      COALESCE(l.actor_is_owner, true)
      AND l.change_type IN ('created','selection_changed','lock_set','lock_cleared','deleted')
      AND COALESCE(l.after_kickoff,false)
      AND public.sheet_was_submitted_at(l.user_id, l.week, l.season, l.changed_at)
    ) AS blocks_submission,
    public.sheet_was_submitted_at(l.user_id, l.week, l.season, l.changed_at) AS was_submitted
  FROM public.pick_change_log l
  LEFT JOIN public.users u ON u.id = l.user_id
  LEFT JOIN public.games g ON g.id = l.game_id
  WHERE l.season = p_season AND l.week = p_week
    AND (NOT p_flagged_only OR COALESCE(l.after_kickoff,false) OR COALESCE(l.after_deadline,false))
  ORDER BY
    (
      COALESCE(l.actor_is_owner, true)
      AND l.change_type IN ('created','selection_changed','lock_set','lock_cleared','deleted')
      AND COALESCE(l.after_kickoff,false)
      AND public.sheet_was_submitted_at(l.user_id, l.week, l.season, l.changed_at)
    ) DESC,
    l.changed_at DESC
  LIMIT 500;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_pick_change_log(integer,integer,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_pick_change_log(integer,integer,boolean) TO authenticated, service_role;
