-- Migration 230: validate a sheet at the moment Submit is clicked
--
-- Until now nothing checked, at submit time, that the week was still open or
-- that the sheet being submitted was legal. The client gates the buttons, but
-- a stale tab, a slow session, or a crafted request all reach the PATCH with
-- no server-side opinion.
--
-- Two rules, and the second is the subtle one the commissioner called out:
--
--   1. The week deadline must not have passed AT CLICK TIME.
--
--   2. A pick on a game that has already locked is fine to submit, PROVIDED
--      it was not changed after that game locked. Editing other games and
--      re-submitting must keep working -- that is the normal flow, and it is
--      what four players legitimately did on 2026-09-04. What is not allowed
--      is carrying a pick that was created, switched, or had its Lock moved
--      after its own game was closed.
--
-- Rule 2 is answered from pick_change_log (migration 223/229), which records
-- exactly those pick-level changes with the per-game lock already applied.
-- Whole-sheet submit/unsubmit rows are deliberately not pick-level and are
-- ignored here, so ordinary re-submission never trips the check.
--
-- Advisory, not enforcement: it returns a verdict for the caller to act on
-- rather than raising, so a failure produces a clear message instead of a
-- generic write error. RLS remains the actual boundary.

CREATE OR REPLACE FUNCTION public.validate_pick_submission(
  p_week integer,
  p_season integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_player uuid := public.current_player_id();
  v_deadline timestamptz;
  v_errors text[] := '{}';
  v_pick_count integer;
  v_lock_count integer;
  r RECORD;
BEGIN
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_signed_in',
      'errors', jsonb_build_array('You are not signed in. Sign out and back in, then try again.'));
  END IF;

  SELECT deadline INTO v_deadline
  FROM public.week_settings WHERE season = p_season AND week = p_week;

  -- Rule 1: the week must still be open right now.
  IF v_deadline IS NOT NULL AND now() > v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deadline_passed',
      'errors', jsonb_build_array(
        'The Week ' || p_week || ' deadline passed at ' ||
        to_char(v_deadline AT TIME ZONE 'America/Chicago', 'Dy Mon DD HH12:MI AM') ||
        ' CT. Picks can no longer be submitted.'));
  END IF;

  SELECT count(*), count(*) FILTER (WHERE is_lock)
  INTO v_pick_count, v_lock_count
  FROM public.picks
  WHERE user_id = v_player AND week = p_week AND season = p_season;

  IF v_pick_count <> 6 THEN
    v_errors := v_errors || ('Your sheet has ' || v_pick_count || ' picks; exactly 6 are required.');
  END IF;
  IF v_lock_count <> 1 THEN
    v_errors := v_errors || ('Your sheet has ' || v_lock_count || ' Lock picks; exactly 1 is required.');
  END IF;

  -- Rule 2: nothing in the sheet may have been altered after its own game
  -- locked. An untouched pick on a locked game is fine.
  FOR r IN
    SELECT DISTINCT (g.away_team || ' @ ' || g.home_team) AS matchup,
           to_char(public.game_effective_lock_time(g.id) AT TIME ZONE 'America/Chicago',
                   'Dy HH12:MI AM') AS locked_at
    FROM public.picks p
    JOIN public.games g ON g.id = p.game_id
    WHERE p.user_id = v_player AND p.week = p_week AND p.season = p_season
      AND EXISTS (
        SELECT 1 FROM public.pick_change_log l
        WHERE l.user_id = v_player
          AND l.game_id = p.game_id
          AND l.week = p_week AND l.season = p_season
          AND l.change_type IN ('created','selection_changed','lock_set','lock_cleared')
          AND l.changed_at > public.game_effective_lock_time(g.id)
          -- Only the player's OWN post-lock edits count against them. A
          -- commissioner correction must not lock someone out of re-submitting
          -- the sheet the commissioner just fixed.
          AND COALESCE(l.actor_is_owner, true)
      )
  LOOP
    v_errors := v_errors ||
      (r.matchup || ' was changed after it locked (' || r.locked_at || ' CT). ' ||
       'That pick can''t be part of this submission.');
  END LOOP;

  IF array_length(v_errors, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'invalid_sheet',
    'errors', to_jsonb(v_errors));
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_pick_submission(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_pick_submission(integer,integer) TO authenticated, service_role;
