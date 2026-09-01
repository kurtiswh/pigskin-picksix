-- Migration 213: find and re-queue pick confirmations that were never created
--
-- WHY. On 2026-09-01 a player submitted six picks correctly and received no
-- confirmation. pg_stat_statements (unreset since 2026-02-20) recorded ZERO
-- executions of queue_pick_confirmation for that submission, while an
-- identical call nine minutes later ran and returned a row -- the request never
-- reached Postgres, most likely a transient PostgREST rejection (a stale schema
-- cache, PGRST202) or a dropped request.
--
-- Nothing in the system could notice. EmailService.processPendingEmails only
-- rescues jobs that EXIST, and this failure created none. The gap was found by
-- hand, comparing the Resend dashboard against the picks table.
--
-- Client-side retry (shipped separately) makes the blip less likely but cannot
-- close the hole: any cause that stops the browser reaching the database still
-- loses the receipt silently. This migration adds the invariant instead --
-- "submitted picks imply a confirmation job" -- and the means to repair it.
--
-- Neither function touches the submission path, so there is no new failure mode
-- for a player submitting picks.

-- ── detector ───────────────────────────────────────────────────────────────
-- Everyone with submitted picks for the week and no picks_submitted job.
-- COALESCE over the payload because week/season became real columns only in
-- migration 211; older rows carry them in the JSON payload alone.
CREATE OR REPLACE FUNCTION public.find_missing_pick_confirmations(
  p_week integer,
  p_season integer
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  submitted_picks bigint,
  submitted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- SECURITY DEFINER over users.email: without this guard any signed-in player
  -- could enumerate every entrant's address.
  PERFORM public.assert_admin_or_server();

  RETURN QUERY
  SELECT
    u.id,
    COALESCE(u.display_name, split_part(u.email, '@', 1)),
    lower(u.email),
    count(*),
    max(p.submitted_at)
  FROM public.picks p
  JOIN public.users u ON u.id = p.user_id
  WHERE p.season = p_season
    AND p.week = p_week
    AND p.submitted = true
    AND NOT EXISTS (
      SELECT 1
      FROM public.email_jobs j
      WHERE j.user_id = p.user_id
        AND j.template_type = 'picks_submitted'
        AND COALESCE(j.week,   (j.payload ->> 'week')::int)   = p_week
        AND COALESCE(j.season, (j.payload ->> 'season')::int) = p_season
        AND j.status <> 'cancelled'
    )
  GROUP BY u.id, u.display_name, u.email
  ORDER BY 2;
END;
$function$;

REVOKE ALL ON FUNCTION public.find_missing_pick_confirmations(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_missing_pick_confirmations(integer, integer) TO authenticated, service_role;

-- ── repair ─────────────────────────────────────────────────────────────────
-- queue_pick_confirmation reads auth.uid(), so it can only ever queue for the
-- caller -- an admin cannot use it to fix someone else's missing receipt. This
-- is the same body addressed to an explicit user, behind an admin guard.
CREATE OR REPLACE FUNCTION public.queue_pick_confirmation_for_user(
  p_user_id uuid,
  p_week integer,
  p_season integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email text;
  v_name text;
  v_submitted timestamptz;
  v_picks jsonb;
  v_job_id uuid;
  v_token uuid := gen_random_uuid();
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT lower(u.email), COALESCE(u.display_name, split_part(u.email, '@', 1))
  INTO v_email, v_name
  FROM public.users u
  WHERE u.id = p_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'No account found for %', p_user_id;
  END IF;

  PERFORM public.assert_confirmation_rate_ok(v_email);

  SELECT jsonb_agg(pick ORDER BY sort_key), max(submitted_at)
  INTO v_picks, v_submitted
  FROM (
    SELECT
      jsonb_build_object(
        'game', g.away_team || ' @ ' || g.home_team,
        'pick', pk.selected_team,
        'spread', COALESCE(g.spread, 0),
        'isLock', COALESCE(pk.is_lock, false),
        'lockTime', g.kickoff_time
      ) AS pick,
      g.kickoff_time AS sort_key,
      pk.submitted_at
    FROM public.picks pk
    JOIN public.games g ON g.id = pk.game_id
    WHERE pk.user_id = p_user_id
      AND pk.week = p_week
      AND pk.season = p_season
      AND pk.submitted = true
  ) s;

  IF v_picks IS NULL THEN
    RAISE EXCEPTION 'No submitted picks found for % in week % of %', p_user_id, p_week, p_season;
  END IF;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, send_token, scheduled_for, status, attempts, week, season
  )
  VALUES (
    p_user_id,
    v_email,
    'picks_submitted',
    format('✅ Week %s Picks Confirmed - %s Games Selected', p_week, jsonb_array_length(v_picks)),
    NULL,
    NULL,
    jsonb_build_object(
      'userDisplayName', v_name,
      'week', p_week,
      'season', p_season,
      'submittedAt', COALESCE(v_submitted, now()),
      'picks', v_picks
    ),
    v_token,
    now(),
    'pending',
    0,
    p_week,
    p_season
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id, 'send_token', v_token);
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_pick_confirmation_for_user(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_pick_confirmation_for_user(uuid, integer, integer) TO authenticated, service_role;
