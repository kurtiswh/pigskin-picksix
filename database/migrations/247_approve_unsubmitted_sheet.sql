-- Migration 247: approve a complete-but-unsubmitted sheet from Week Review
--
-- Every week a few players build a full sheet and never press submit. The
-- commissioner has been counting them by hand -- two in 2026 week 1, and one of
-- those turned out to be a player whose login pointed at no profile at all, so
-- he could not have submitted. Doing it by hand means deciding, every time,
-- whether counting a sheet would double-count a player who also has an
-- anonymous entry, or admit a pick made after its game locked.
--
-- So the checks move into the database next to the write. wr_unsubmitted_entries
-- now reports why a sheet cannot be approved, and wr_approve_unsubmitted_sheet
-- re-runs every one of those checks itself before it writes: the button cannot
-- approve something the list says is blocked, whatever the caller believes.
--
-- What makes a sheet approvable:
--   exactly 6 live picks and exactly 1 lock;
--   nothing already counting for that week -- no submitted account picks, no
--     anonymous entry on the leaderboard -- since the views would otherwise
--     score the player twice;
--   no pick created after its own game's effective lock time, and no logged
--     change to a pick after kickoff. Lock time, not kickoff, is the rule:
--     Thursday and Friday games lock at 6pm CT on game day and everything else
--     rides the Saturday deadline.
--
-- submitted_at is the moment of approval, never back-dated: the audit trail has
-- to keep saying the sheet was not live during the week.

DROP FUNCTION IF EXISTS public.wr_unsubmitted_entries(integer, integer);

CREATE FUNCTION public.wr_unsubmitted_entries(p_week integer, p_season integer)
RETURNS TABLE(
  user_id uuid, display_name text, email text,
  picks bigint, has_lock boolean, complete boolean,
  last_touch timestamptz,
  lock_count integer, picks_after_lock integer, changes_after_kickoff integer,
  already_counted boolean, is_paid boolean,
  approvable boolean, blockers text
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
  )
  SELECT
    c.uid, c.nm, c.em, c.n_picks, c.n_locks > 0, (c.n_picks = 6 AND c.n_locks = 1),
    c.touched, c.n_locks, c.n_late, c.n_changed_late,
    c.has_anon, c.paid,
    (c.n_picks = 6 AND c.n_locks = 1 AND c.n_late = 0 AND c.n_changed_late = 0 AND NOT c.has_anon),
    btrim(concat_ws('; ',
      CASE WHEN c.n_picks <> 6 THEN c.n_picks || ' picks, needs 6' END,
      CASE WHEN c.n_locks <> 1 THEN c.n_locks || ' locks, needs 1' END,
      CASE WHEN c.n_late > 0 THEN c.n_late || ' pick(s) made after that game locked' END,
      CASE WHEN c.n_changed_late > 0 THEN c.n_changed_late || ' pick change(s) after kickoff' END,
      CASE WHEN c.has_anon THEN 'already counting an anonymous entry this week' END))
  FROM checked c
  ORDER BY (c.n_picks = 6 AND c.n_locks = 1) DESC, c.touched DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_unsubmitted_entries(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_unsubmitted_entries(integer, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wr_approve_unsubmitted_sheet(
  p_user_id uuid, p_week integer, p_season integer, p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_updated int;
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT * INTO r FROM public.wr_unsubmitted_entries(p_week, p_season) e
  WHERE e.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No unsubmitted sheet for that player in week % of %', p_week, p_season;
  END IF;

  IF NOT r.approvable THEN
    RAISE EXCEPTION 'Cannot approve %: %', r.display_name, r.blockers;
  END IF;

  UPDATE public.picks p
  SET submitted = true,
      submitted_at = now(),
      admin_note = COALESCE(p_note, format(
        'Approved by the commissioner %s: complete sheet of 6 picks with a lock, every pick made before its game locked, nothing else counting for the week. Submit was never pressed. submitted_at is the time of approval, not back-dated.',
        to_char(now() AT TIME ZONE 'America/Chicago', 'YYYY-MM-DD')))
  WHERE p.user_id = p_user_id AND p.season = p_season AND p.week = p_week
    AND p.submitted = false;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'approved', true, 'player', r.display_name, 'picks_counted', v_updated,
    'week', p_week, 'season', p_season);
END;
$function$;

REVOKE ALL ON FUNCTION public.wr_approve_unsubmitted_sheet(uuid, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wr_approve_unsubmitted_sheet(uuid, integer, integer, text) TO authenticated, service_role;
