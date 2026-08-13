-- Migration 201: the server renders pick confirmations; clients stop supplying bodies
--
-- Follows migration 200, which named this as the work that had to happen before
-- anon could lose INSERT/SELECT on email_jobs.
--
-- The real hole was not the policy. send-email authorized system calls with
-- `token === serviceKey || token.startsWith('eyJ')`, so any JWT-shaped string
-- bought the right to POST arbitrary `to`, `subject` and `html` and have it
-- delivered over pigskinpicksix.com. That check is now an exact comparison, and
-- the function only accepts a body from the service role or a signed-in admin.
--
-- Everyone else names a queued job instead. This migration is what makes that
-- possible for pick confirmations, which is the one email an ordinary visitor
-- legitimately causes to be sent:
--
--   * email_jobs gains `payload` — structured, server-derived data instead of
--     markup — and `send_token`, a one-time secret proving the caller is the
--     person the job was created for.
--   * Two SECURITY DEFINER RPCs build those jobs from what is already in the
--     database. They accept no subject and no HTML. The picks come out of
--     anonymous_picks / picks and the spreads out of games, so a caller cannot
--     put words in an email even about their own picks.
--
-- The Edge Function renders the payload with the same TypeScript template the
-- app uses (supabase/functions/_shared/, kept in step by
-- scripts/sync-shared-templates.mjs), so the email is byte-for-byte the one
-- players already receive and there is no second copy of the HTML in plpgsql.
--
-- NOT done here: revoking anon's INSERT/SELECT on email_jobs. That needs the
-- call-site audit described at the bottom of migration 200 and lands separately.
-- Until then a payload-less job written by a client is simply unsendable by an
-- unprivileged caller — send-email refuses to read html_content for them.

-- ── 1. Columns ─────────────────────────────────────────────────────────────

ALTER TABLE public.email_jobs
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS send_token uuid;

COMMENT ON COLUMN public.email_jobs.payload IS
  'Server-derived template data for jobs the server renders itself. When set, '
  'send-email renders from this and ignores html_content — which is why an '
  'unprivileged caller may only send jobs that have one.';

COMMENT ON COLUMN public.email_jobs.send_token IS
  'One-time secret returned by the queue_* RPCs and required to send the job. '
  'Cleared when the send succeeds, so job ids are useless on their own.';

-- Payload-rendered jobs carry no markup, so these can no longer be required.
ALTER TABLE public.email_jobs ALTER COLUMN html_content DROP NOT NULL;
ALTER TABLE public.email_jobs ALTER COLUMN text_content DROP NOT NULL;

-- ── 2. Only the server may write the server's columns ──────────────────────
--
-- Without this the whole scheme has a hole in it: "Anyone can insert email
-- jobs" is still in force, so a caller could write their own `payload` and
-- their own `send_token`, then ask send-email to render it — arbitrary text in
-- a Pigskin-branded email to any address. Escaping stops that being arbitrary
-- *markup*, but not arbitrary words over our sending domain.
--
-- A trigger rather than a policy, because RLS ORs permissive policies together
-- and the blanket INSERT policy would win. Inside a SECURITY DEFINER function
-- current_user is the function owner, so the queue_* RPCs write these columns
-- freely; PostgREST runs as anon/authenticated and cannot. On UPDATE the old
-- values are carried over rather than nulled, so an ordinary status update
-- (processPendingEmails marking a job sent) doesn't wipe the payload.
CREATE OR REPLACE FUNCTION public.email_jobs_guard_server_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.payload := OLD.payload;
      NEW.send_token := OLD.send_token;
    ELSE
      NEW.payload := NULL;
      NEW.send_token := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_jobs_guard_server_fields ON public.email_jobs;
CREATE TRIGGER email_jobs_guard_server_fields
  BEFORE INSERT OR UPDATE ON public.email_jobs
  FOR EACH ROW EXECUTE FUNCTION public.email_jobs_guard_server_fields();

COMMENT ON FUNCTION public.email_jobs_guard_server_fields() IS
  'payload and send_token are server-owned. Clients writing email_jobs through '
  'PostgREST cannot set or change them; the SECURITY DEFINER queue_* RPCs and '
  'the service role can.';

-- ── 3. Shared helpers ──────────────────────────────────────────────────────

-- Cheap abuse brake. The confirmation only ever contains the recipient's own
-- picks and only ever goes to the address that submitted them, so the worst
-- case is repeat delivery of the same mail — but repeat delivery is still how
-- you burn a sending domain.
CREATE OR REPLACE FUNCTION public.assert_confirmation_rate_ok(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent integer;
BEGIN
  SELECT count(*) INTO v_recent
  FROM public.email_jobs
  WHERE template_type = 'picks_submitted'
    AND lower(email) = lower(p_email)
    AND created_at > now() - interval '1 hour';

  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'Too many confirmation emails requested for this address; try again later'
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_confirmation_rate_ok(text) FROM PUBLIC;

-- ── 4. Anonymous pick confirmation ─────────────────────────────────────────
--
-- Takes no name, no subject, no body, and no pick list. p_email selects whose
-- picks to describe, and is by construction also the only address the mail can
-- reach: the picks and the recipient come from the same anonymous_picks rows.

CREATE OR REPLACE FUNCTION public.queue_anonymous_pick_confirmation(
  p_email text,
  p_week integer,
  p_season integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(p_email));
  v_name text;
  v_submitted timestamptz;
  v_picks jsonb;
  v_job_id uuid;
  v_token uuid := gen_random_uuid();
BEGIN
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  PERFORM public.assert_confirmation_rate_ok(v_email);

  SELECT ap.name, max(ap.submitted_at)
  INTO v_name, v_submitted
  FROM public.anonymous_picks ap
  WHERE lower(ap.email) = v_email
    AND ap.week = p_week
    AND ap.season = p_season
  GROUP BY ap.name
  ORDER BY max(ap.submitted_at) DESC
  LIMIT 1;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'No picks found for % in week % of %', v_email, p_week, p_season;
  END IF;

  SELECT jsonb_agg(pick ORDER BY sort_key)
  INTO v_picks
  FROM (
    SELECT
      jsonb_build_object(
        'game', COALESCE(g.away_team, ap.away_team) || ' @ ' || COALESCE(g.home_team, ap.home_team),
        'pick', ap.selected_team,
        'spread', COALESCE(g.spread, 0),
        'isLock', COALESCE(ap.is_lock, false),
        'lockTime', g.kickoff_time
      ) AS pick,
      COALESCE(g.kickoff_time, ap.created_at) AS sort_key
    FROM public.anonymous_picks ap
    LEFT JOIN public.games g ON g.id = ap.game_id
    WHERE lower(ap.email) = v_email
      AND ap.week = p_week
      AND ap.season = p_season
  ) s;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, send_token, scheduled_for, status, attempts
  )
  VALUES (
    NULL,
    v_email,
    'picks_submitted',
    -- Kept in sync with getPicksSubmittedSubject(); the Edge Function renders
    -- the real one, this is for anyone reading the queue.
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
    0
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id, 'send_token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_anonymous_pick_confirmation(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_anonymous_pick_confirmation(text, integer, integer) TO anon, authenticated;

COMMENT ON FUNCTION public.queue_anonymous_pick_confirmation(text, integer, integer) IS
  'Queue the pick-confirmation email for an anonymous submitter. Derives the '
  'recipient, name and picks from anonymous_picks and games — the caller '
  'supplies no content. Returns {job_id, send_token} for send-email.';

-- ── 5. Signed-in pick confirmation ─────────────────────────────────────────
--
-- Same shape, sourced from picks. Takes no email at all: it goes to the address
-- on the caller's own account, so a signed-in player cannot aim it at anyone.

CREATE OR REPLACE FUNCTION public.queue_pick_confirmation(
  p_week integer,
  p_season integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_submitted timestamptz;
  v_picks jsonb;
  v_job_id uuid;
  v_token uuid := gen_random_uuid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Must be signed in';
  END IF;

  SELECT lower(u.email), COALESCE(u.display_name, split_part(u.email, '@', 1))
  INTO v_email, v_name
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'No account found';
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
    WHERE pk.user_id = v_uid
      AND pk.week = p_week
      AND pk.season = p_season
      AND pk.submitted = true
  ) s;

  IF v_picks IS NULL THEN
    RAISE EXCEPTION 'No submitted picks found for week % of %', p_week, p_season;
  END IF;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, send_token, scheduled_for, status, attempts
  )
  VALUES (
    v_uid,
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
    0
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id, 'send_token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_pick_confirmation(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_pick_confirmation(integer, integer) TO authenticated;

COMMENT ON FUNCTION public.queue_pick_confirmation(integer, integer) IS
  'Queue the pick-confirmation email for the signed-in player. Recipient is the '
  'address on their own account; picks come from the picks table. Returns '
  '{job_id, send_token} for send-email.';
