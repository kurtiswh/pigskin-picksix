-- Migration 249: let the commissioner count a short unsubmitted sheet
--
-- 247 only approves a sheet of exactly 6 picks and 1 lock. Week 3 of 2026 had
-- players who made 5 picks (some with no lock), never pressed submit, and whom
-- the commissioner wanted scored on what they did pick. Those rows showed
-- "Cannot count: 5 picks, needs 6" with no way through.
--
-- The count and lock rules become an override rather than a wall. The rules
-- that protect the integrity of the week stay hard, in the list and again in
-- the approve function:
--   at least 1 and at most 6 live picks, at most 1 lock;
--   nothing already counting for that week (no double scoring);
--   no pick made after its game locked, no logged change after kickoff.
-- A sheet that passes those but is short is "approvable_short". Approving it
-- needs p_allow_short => true, which the Week Review button only sends after a
-- confirm, and the admin note says the sheet was short. Missing picks simply
-- score nothing; a sheet with no lock has no doubled pick.

DROP FUNCTION IF EXISTS public.wr_unsubmitted_entries(integer, integer);

CREATE FUNCTION public.wr_unsubmitted_entries(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid, display_name text, email text,
  picks bigint, has_lock boolean, complete boolean,
  last_touch timestamptz,
  lock_count integer, picks_after_lock integer, changes_after_kickoff integer,
  already_counted boolean, is_paid boolean,
  approvable boolean, blockers text,
  -- countable with the short-sheet override: only the pick/lock count is off
  approvable_short boolean,
  -- blockers the override cannot get past; null when approvable_short
  hard_blockers text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_admin_or_server();

  RETURN QUERY
  WITH sheets AS (
    SELECT
      u.id AS uid,
      COALESCE(u.display_name, split_part(u.email, '@', 1)) AS nm,
      lower(u.email) AS em,
      count(*) FILTER (WHERE NOT p.disqualified) AS n_picks,
      count(*) FILTER (WHERE p.is_lock AND NOT p.disqualified)::int AS n_locks,
      count(*) FILTER (WHERE p.created_at > public.game_effective_lock_time(p.game_id))::int AS n_late,
      max(p.created_at) AS touched
    FROM public.picks p
    JOIN public.users u ON u.id = p.user_id
    WHERE p.season = p_season AND p.week = p_week
    GROUP BY u.id, u.display_name, u.email
    HAVING count(*) FILTER (WHERE p.submitted) = 0
  ), checked AS (
    SELECT s.*,
      (SELECT count(*) FROM public.pick_change_log c
        WHERE c.user_id = s.uid AND c.season = p_season AND c.week = p_week
          AND c.after_kickoff)::int AS n_changed_late,
      EXISTS (SELECT 1 FROM public.anonymous_picks a
              WHERE a.assigned_user_id = s.uid AND a.season = p_season AND a.week = p_week
                AND a.show_on_leaderboard AND NOT COALESCE(a.disqualified, false)) AS has_anon,
      EXISTS (SELECT 1 FROM public.leaguesafe_payments l
              WHERE l.user_id = s.uid AND l.season = p_season AND l.status = 'Paid') AS paid
    FROM sheets s
  ), judged AS (
    SELECT c.*,
      NULLIF(btrim(concat_ws('; ',
        CASE WHEN c.n_picks = 0 THEN 'no live picks' END,
        CASE WHEN c.n_picks > 6 THEN c.n_picks || ' picks, max 6' END,
        CASE WHEN c.n_locks > 1 THEN c.n_locks || ' locks, max 1' END,
        CASE WHEN c.n_late > 0 THEN c.n_late || ' pick(s) made after that game locked' END,
        CASE WHEN c.n_changed_late > 0 THEN c.n_changed_late || ' pick change(s) after kickoff' END,
        CASE WHEN c.has_anon THEN 'already counting an anonymous entry this week' END)), '') AS hard
    FROM checked c
  )
  SELECT
    j.uid, j.nm, j.em, j.n_picks, j.n_locks > 0, (j.n_picks = 6 AND j.n_locks = 1),
    j.touched, j.n_locks, j.n_late, j.n_changed_late,
    j.has_anon, j.paid,
    (j.n_picks = 6 AND j.n_locks = 1 AND j.hard IS NULL),
    btrim(concat_ws('; ',
      CASE WHEN j.n_picks <> 6 THEN j.n_picks || ' picks, needs 6' END,
      CASE WHEN j.n_locks <> 1 THEN j.n_locks || ' locks, needs 1' END,
      CASE WHEN j.n_late > 0 THEN j.n_late || ' pick(s) made after that game locked' END,
      CASE WHEN j.n_changed_late > 0 THEN j.n_changed_late || ' pick change(s) after kickoff' END,
      CASE WHEN j.has_anon THEN 'already counting an anonymous entry this week' END)),
    (j.hard IS NULL AND NOT (j.n_picks = 6 AND j.n_locks = 1)),
    j.hard
  FROM judged j
  ORDER BY (j.n_picks = 6 AND j.n_locks = 1) DESC, (j.hard IS NULL) DESC, j.touched DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_unsubmitted_entries(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_unsubmitted_entries(integer, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.wr_approve_unsubmitted_sheet(uuid, integer, integer, text);

CREATE FUNCTION public.wr_approve_unsubmitted_sheet(
  p_user_id uuid, p_week integer, p_season integer, p_note text DEFAULT NULL,
  p_allow_short boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_updated int;
  v_note text;
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT * INTO r FROM public.wr_unsubmitted_entries(p_week, p_season) e
  WHERE e.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No unsubmitted sheet for that player in week % of %', p_week, p_season;
  END IF;

  IF r.approvable THEN
    v_note := format(
      'Approved by the commissioner %s: complete sheet of 6 picks with a lock, every pick made before its game locked, nothing else counting for the week. Submit was never pressed. submitted_at is the time of approval, not back-dated.',
      to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD'));
  ELSIF r.approvable_short AND p_allow_short THEN
    v_note := format(
      'Approved by the commissioner %s as a SHORT sheet: %s pick(s), %s lock(s); missing picks score nothing. Every pick made before its game locked, nothing else counting for the week. Submit was never pressed. submitted_at is the time of approval, not back-dated.',
      to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD'), r.picks, r.lock_count);
  ELSIF r.approvable_short THEN
    RAISE EXCEPTION 'Cannot approve %: %. Counting a short sheet needs the short-sheet override.',
      r.display_name, r.blockers;
  ELSE
    RAISE EXCEPTION 'Cannot approve %: %', r.display_name, COALESCE(r.hard_blockers, r.blockers);
  END IF;

  UPDATE public.picks p
  SET submitted = true,
      submitted_at = now(),
      admin_note = COALESCE(p_note, v_note)
  WHERE p.user_id = p_user_id AND p.season = p_season AND p.week = p_week
    AND p.submitted = false;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'approved', true, 'player', r.display_name, 'picks_counted', v_updated,
    'short', NOT r.approvable, 'week', p_week, 'season', p_season);
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_approve_unsubmitted_sheet(uuid, integer, integer, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_approve_unsubmitted_sheet(uuid, integer, integer, text, boolean) TO authenticated, service_role;
