-- Migration 261: make reminder emails actually arrive
--
-- A player submitted week 11 of 2026 on Friday, edited a pick on Saturday
-- morning (which unsubmits the sheet), never pressed Submit again, and got no
-- email about it. Looking for his reminder turned up three separate faults, and
-- between them only 865 of 14,148 queued reminders had sent all season:
--
-- 1. The processor's cron schedule was '0 */15 6-23 * * *'. It was written as a
--    six-field "every 15 minutes, 6 AM to 11 PM" expression, but pg_cron reads
--    five fields: minute 0, every 15th hour, days 6 to 23 of the month. So the
--    job ran at 00:00 and 15:00 UTC, and not at all from the 24th to the 5th.
--
-- 2. Reminders were queued against a placeholder deadline. Saving a week's
--    games creates its week_settings row with deadline = now() + 7 days; picks
--    were then opened (which queues the reminders) before the real Saturday
--    deadline was saved. Seven of thirteen weeks had every reminder scheduled
--    four to five days AFTER the real deadline. Migration 225 met the same
--    problem in week 1 and cleaned it up by hand; nothing stopped it recurring.
--
-- 3. The processor took 50 jobs per run and left the rest pending forever. A
--    slot is ~500 jobs, most of them for players who have already submitted,
--    and those were skipped one round trip at a time.
--
-- What changes here:
--   * the schedule becomes every 2 minutes, every day;
--   * moving a week's deadline moves its pending reminders with it;
--   * choosing what to send moves into SQL (claim_due_reminder_emails), which
--     cancels everything that should not send in set-based statements, never
--     releases a reminder after the deadline it is about, and claims rows so
--     two overlapping runs cannot send the same email twice;
--   * the "saved but not submitted" nudge (migration 224) is queued
--     automatically 3 hours and 1 hour before every deadline, with the audience
--     read at send time, instead of only when someone remembers to press it;
--   * a watchdog on its own schedule emails the admins when reminders are
--     overdue, scheduled after their deadline, failing, or the processor has
--     stopped, so this cannot fail silently again;
--   * reminder-class email stops at a configurable share of the monthly send
--     allowance, so reminders can never crowd out pick confirmations.

-- ── configuration ──────────────────────────────────────────────────────────
-- One row. monthly_quota is the Resend plan's monthly allowance; reminders,
-- nudges and unsubmit notices stop once the month's sends reach
-- reminder_ceiling_pct of it, leaving the remainder for confirmations.
CREATE TABLE IF NOT EXISTS public.reminder_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  monthly_quota integer NOT NULL DEFAULT 50000 CHECK (monthly_quota > 0),
  reminder_ceiling_pct integer NOT NULL DEFAULT 80 CHECK (reminder_ceiling_pct BETWEEN 1 AND 100),
  nudge_hours numeric[] NOT NULL DEFAULT '{3,1}',
  alerts_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.reminder_config IS
  'Single-row settings for reminder emails: monthly send allowance, the share of it reminders may use, when the saved-but-not-submitted nudge goes out, and whether the watchdog emails admins.';
ALTER TABLE public.reminder_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reminder_config_admin_read ON public.reminder_config;
CREATE POLICY reminder_config_admin_read ON public.reminder_config
  FOR SELECT TO authenticated USING (public.is_current_user_admin());
DROP POLICY IF EXISTS reminder_config_admin_write ON public.reminder_config;
CREATE POLICY reminder_config_admin_write ON public.reminder_config
  FOR UPDATE TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
INSERT INTO public.reminder_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- What the watchdog has already told the admins, so it does not repeat itself.
CREATE TABLE IF NOT EXISTS public.email_health_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  emailed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.email_health_alerts IS
  'Problems the reminder watchdog found (overdue, scheduled after deadline, failing, processor stopped, send ceiling). Written by reminder_watchdog and the process-reminders function.';
CREATE INDEX IF NOT EXISTS idx_email_health_alerts_kind_created
  ON public.email_health_alerts (kind, created_at DESC);
ALTER TABLE public.email_health_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_health_alerts_admin_read ON public.email_health_alerts;
CREATE POLICY email_health_alerts_admin_read ON public.email_health_alerts
  FOR SELECT TO authenticated USING (public.is_current_user_admin());

-- A run marks the rows it is about to send. A claim older than ten minutes is
-- treated as abandoned (the run died) and the row can be taken again.
ALTER TABLE public.email_jobs ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_email_jobs_sent_at
  ON public.email_jobs (sent_at) WHERE status = 'sent';

-- The email types this pipeline owns. picks_unsubmit_notice arrives in 262.
CREATE OR REPLACE FUNCTION public.reminder_email_types()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$ SELECT ARRAY['pick_reminder','deadline_alert','picks_unsubmitted','picks_unsubmit_notice']; $$;

-- ── a deadline that moves takes its reminders with it ──────────────────────
-- Reminder jobs carry hoursLeft, nudges carry hoursBefore; either is enough to
-- place the job again.
CREATE OR REPLACE FUNCTION public.reschedule_reminders_on_deadline_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.deadline IS NULL OR NEW.deadline IS NOT DISTINCT FROM OLD.deadline THEN
    RETURN NEW;
  END IF;

  UPDATE public.email_jobs j
  SET scheduled_for = NEW.deadline - make_interval(mins =>
        round(COALESCE(j.payload->>'hoursLeft', j.payload->>'hoursBefore')::numeric * 60)::int),
      payload = jsonb_set(j.payload, '{deadline}', to_jsonb(NEW.deadline))
  WHERE j.season = NEW.season AND j.week = NEW.week
    AND j.status = 'pending'
    AND j.template_type IN ('pick_reminder','deadline_alert','picks_unsubmitted')
    AND COALESCE(j.payload->>'hoursLeft', j.payload->>'hoursBefore') ~ '^[0-9]+(\.[0-9]+)?$'
    -- a nudge queued to send immediately is not tied to the deadline
    AND j.scheduled_for > now();

  -- A slot that lands in the past is left for the processor: it sends one that
  -- is under three hours late (a deadline pulled closer is exactly when a
  -- prompt reminder helps) and cancels anything older.
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_reschedule_reminders_on_deadline_change ON public.week_settings;
CREATE TRIGGER trg_reschedule_reminders_on_deadline_change
  AFTER UPDATE OF deadline ON public.week_settings
  FOR EACH ROW
  WHEN (OLD.deadline IS DISTINCT FROM NEW.deadline)
  EXECUTE FUNCTION public.reschedule_reminders_on_deadline_change();

-- ── month-to-date sends ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.email_sends_this_month()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT count(*)::int FROM public.email_jobs
  WHERE status = 'sent' AND sent_at >= date_trunc('month', now());
$$;
REVOKE ALL ON FUNCTION public.email_sends_this_month() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_sends_this_month() TO service_role;

-- ── decide what sends ──────────────────────────────────────────────────────
-- Everything that should NOT send is cancelled first, with the reason kept on
-- the row; then up to p_limit of what is left is claimed and returned.
CREATE OR REPLACE FUNCTION public.claim_due_reminder_emails(p_limit integer DEFAULT 100)
RETURNS TABLE (
  job_id uuid, to_email text, job_type text, job_subject text,
  job_payload jsonb, job_week integer, job_season integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_types constant text[] := public.reminder_email_types();
  v_quota integer;
  v_pct integer;
  v_room integer;
BEGIN
  PERFORM public.assert_admin_or_server();

  -- A row is "free" when no run holds a live claim on it.
  -- 1. The week it is about has closed.
  UPDATE public.email_jobs j
  SET status = 'cancelled', error_message = 'Not sent: the week''s deadline had passed'
  FROM public.week_settings ws
  WHERE ws.season = j.season AND ws.week = j.week
    AND j.status = 'pending' AND j.template_type = ANY (c_types)
    AND j.scheduled_for <= now()
    AND (j.claimed_at IS NULL OR j.claimed_at < now() - interval '10 minutes')
    AND ws.deadline <= now();

  -- 2. Too late to mean anything. Jobs used to sit pending forever instead.
  UPDATE public.email_jobs j
  SET status = 'cancelled', error_message = 'Not sent: more than 3 hours past its scheduled time'
  WHERE j.status = 'pending' AND j.template_type = ANY (c_types)
    AND j.scheduled_for < now() - interval '3 hours'
    AND (j.claimed_at IS NULL OR j.claimed_at < now() - interval '10 minutes');

  -- 3. Tried three times already.
  UPDATE public.email_jobs j
  SET status = 'failed',
      error_message = COALESCE(j.error_message, 'Gave up after 3 attempts')
  WHERE j.status = 'pending' AND j.template_type = ANY (c_types)
    AND j.scheduled_for <= now()
    AND j.attempts >= 3
    AND (j.claimed_at IS NULL OR j.claimed_at < now() - interval '10 minutes');

  -- 4. The player is already entered: a submitted sheet, or an anonymous entry
  --    that is counting (the same test Week Review uses, migration 247).
  UPDATE public.email_jobs j
  SET status = 'cancelled', error_message = 'Not sent: picks already submitted'
  WHERE j.status = 'pending' AND j.template_type = ANY (c_types)
    AND j.scheduled_for <= now()
    AND (j.claimed_at IS NULL OR j.claimed_at < now() - interval '10 minutes')
    AND j.user_id IS NOT NULL AND j.week IS NOT NULL AND j.season IS NOT NULL
    AND (
      EXISTS (SELECT 1 FROM public.picks p
              WHERE p.user_id = j.user_id AND p.week = j.week AND p.season = j.season
                AND p.submitted)
      OR EXISTS (SELECT 1 FROM public.anonymous_picks a
                 WHERE a.assigned_user_id = j.user_id AND a.week = j.week AND a.season = j.season
                   AND a.show_on_leaderboard AND NOT COALESCE(a.disqualified, false))
    );

  -- 5. "Picks due soon" goes to paid entries only, re-checked here because a
  --    register re-upload can flip someone after their job was queued. The
  --    saved-but-not-submitted emails are exempt: picks count during the grace
  --    period regardless of payment, and those emails never mention money.
  UPDATE public.email_jobs j
  SET status = 'cancelled', error_message = 'Not sent: entry not marked paid'
  WHERE j.status = 'pending' AND j.template_type IN ('pick_reminder','deadline_alert')
    AND j.scheduled_for <= now()
    AND (j.claimed_at IS NULL OR j.claimed_at < now() - interval '10 minutes')
    AND j.user_id IS NOT NULL AND j.season IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.leaguesafe_payments lp
                    WHERE lp.user_id = j.user_id AND lp.season = j.season AND lp.status = 'Paid');

  -- 6. Stay under the send ceiling. Rows left pending here are picked up by a
  --    later run if room appears, or expire through steps 1 and 2.
  SELECT rc.monthly_quota, rc.reminder_ceiling_pct INTO v_quota, v_pct
  FROM public.reminder_config rc;
  v_room := GREATEST(COALESCE(p_limit, 0), 0);
  IF v_quota IS NOT NULL THEN
    v_room := LEAST(v_room, GREATEST((v_quota * v_pct / 100) - public.email_sends_this_month(), 0));
  END IF;
  IF v_room = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT j.id
    FROM public.email_jobs j
    WHERE j.status = 'pending' AND j.template_type = ANY (c_types)
      AND j.scheduled_for <= now()
      AND (j.claimed_at IS NULL OR j.claimed_at < now() - interval '10 minutes')
    ORDER BY (j.template_type = 'picks_unsubmit_notice') DESC, j.scheduled_for, j.created_at
    LIMIT v_room
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.email_jobs j
  SET claimed_at = now(), attempts = COALESCE(j.attempts, 0) + 1
  FROM due
  WHERE j.id = due.id
  RETURNING j.id, j.email, j.template_type, j.subject, j.payload, j.week, j.season;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_due_reminder_emails(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_reminder_emails(integer) TO service_role;

-- A run that stops early (Resend throttling, or out of time) hands back what it
-- did not send, so the next run takes those rows at once instead of waiting for
-- the ten-minute claim to lapse. The attempt is refunded: it was never made.
CREATE OR REPLACE FUNCTION public.release_reminder_claims(p_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  PERFORM public.assert_admin_or_server();
  UPDATE public.email_jobs j
  SET claimed_at = NULL, attempts = GREATEST(COALESCE(j.attempts, 0) - 1, 0)
  WHERE j.id = ANY (p_ids) AND j.status = 'pending';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.release_reminder_claims(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_reminder_claims(uuid[]) TO service_role;

-- The processor reports problems it meets while sending (a quota refusal from
-- Resend, for one) so the watchdog's email can include them.
CREATE OR REPLACE FUNCTION public.record_email_health_alert(p_kind text, p_details jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_admin_or_server();
  IF NOT EXISTS (SELECT 1 FROM public.email_health_alerts a
                 WHERE a.kind = p_kind AND a.created_at > now() - interval '6 hours') THEN
    INSERT INTO public.email_health_alerts (kind, details) VALUES (p_kind, COALESCE(p_details, '{}'::jsonb));
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_email_health_alert(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_health_alert(text, jsonb) TO service_role;

-- ── the saved-but-not-submitted nudge, on a schedule ───────────────────────
-- For every open week, once per configured hour mark: queue the nudge for
-- whoever has picks saved and nothing submitted RIGHT NOW. Reading the audience
-- at send time is the point. A player who submits on Friday and unsubmits on
-- Saturday morning was invisible to anything queued when the week opened.
CREATE OR REPLACE FUNCTION public.reminder_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
  h numeric;
  v_hours numeric[];
  v_result jsonb;
  v_queued integer := 0;
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT rc.nudge_hours INTO v_hours FROM public.reminder_config rc;
  IF v_hours IS NULL OR array_length(v_hours, 1) IS NULL THEN
    RETURN jsonb_build_object('nudges_queued', 0);
  END IF;

  FOR w IN
    SELECT ws.season, ws.week, ws.deadline
    FROM public.week_settings ws
    WHERE ws.picks_open AND ws.deadline > now()
      AND ws.deadline <= now() + make_interval(mins => (
            (SELECT max(x) FROM unnest(v_hours) x) * 60)::int)
  LOOP
    FOREACH h IN ARRAY v_hours LOOP
      -- inside this mark's 30-minute window, and not already done for the week
      IF now() >= w.deadline - make_interval(mins => (h * 60)::int)
         AND now() <  w.deadline - make_interval(mins => (h * 60)::int) + interval '30 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM public.email_jobs j
           WHERE j.template_type = 'picks_unsubmitted'
             AND j.season = w.season AND j.week = w.week
             AND (j.payload->>'hoursBefore')::numeric = h)
      THEN
        v_result := public.queue_unsubmitted_pick_nudges(w.season, w.week, h, false, true);
        v_queued := v_queued + COALESCE((v_result->>'queued')::int, 0);
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('nudges_queued', v_queued);
END;
$function$;
REVOKE ALL ON FUNCTION public.reminder_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminder_sweep() TO service_role;

-- ── what cron calls ────────────────────────────────────────────────────────
-- Sweep, then wake the edge function only when something is actually due, so a
-- quiet Tuesday costs one cheap query every two minutes and nothing else.
CREATE OR REPLACE FUNCTION public.run_reminder_processor()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sweep jsonb;
  v_due integer;
  tok text;
  resp http_response;
BEGIN
  PERFORM public.assert_admin_or_server();

  BEGIN
    v_sweep := public.reminder_sweep();
  EXCEPTION WHEN OTHERS THEN
    -- a broken sweep must never stop reminders that are already queued
    v_sweep := jsonb_build_object('error', SQLERRM);
  END;

  SELECT count(*) INTO v_due
  FROM public.email_jobs j
  WHERE j.status = 'pending' AND j.template_type = ANY (public.reminder_email_types())
    AND j.scheduled_for <= now()
    AND (j.claimed_at IS NULL OR j.claimed_at < now() - interval '10 minutes');

  IF v_due = 0 THEN
    RETURN jsonb_build_object('sweep', v_sweep, 'due', 0);
  END IF;

  -- Not invoke_edge(): its 25s timeout is right for scoring but a full batch of
  -- sends takes about that long, and a timeout here would mark a run that is
  -- still sending as failed. Errors are raised, not swallowed, so a failing
  -- processor shows up as failed runs for the watchdog to see.
  SELECT decrypted_secret INTO tok FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF tok IS NULL THEN RAISE EXCEPTION 'Vault service_role_key missing'; END IF;
  PERFORM http_set_curlopt('CURLOPT_TIMEOUT_MS', '55000');
  SELECT * INTO resp FROM http((
    'POST',
    'https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/process-reminders',
    ARRAY[http_header('Authorization', 'Bearer ' || tok)],
    'application/json', '{}')::http_request);
  IF resp.status >= 400 THEN
    RAISE EXCEPTION 'process-reminders returned %: %', resp.status, left(resp.content, 300);
  END IF;

  RETURN jsonb_build_object('sweep', v_sweep, 'due', v_due, 'edge_status', resp.status,
                            'edge_result', left(resp.content, 300));
END;
$function$;
REVOKE ALL ON FUNCTION public.run_reminder_processor() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_reminder_processor() TO service_role;

-- ── health ─────────────────────────────────────────────────────────────────
-- One place that says whether reminders are working. Used by the watchdog and
-- readable by admins.
CREATE OR REPLACE FUNCTION public.reminder_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_types constant text[] := public.reminder_email_types();
  v_job_id bigint;
  v_last_ok timestamptz;
  v_last_run timestamptz;
  v_last_status text;
  v_overdue integer;
  v_after_deadline integer;
  v_failed integer;
  v_sent_month integer;
  v_sent_today integer;
  v_quota integer;
  v_pct integer;
  v_upcoming jsonb;
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'process-reminder-emails';
  SELECT max(start_time) FILTER (WHERE status = 'succeeded'), max(start_time)
  INTO v_last_ok, v_last_run
  FROM cron.job_run_details WHERE jobid = v_job_id;
  SELECT d.status INTO v_last_status
  FROM cron.job_run_details d WHERE d.jobid = v_job_id ORDER BY d.start_time DESC LIMIT 1;

  -- due more than 20 minutes ago, still pending, and the week is still open
  SELECT count(*) INTO v_overdue
  FROM public.email_jobs j
  JOIN public.week_settings ws ON ws.season = j.season AND ws.week = j.week
  WHERE j.status = 'pending' AND j.template_type = ANY (c_types)
    AND j.scheduled_for < now() - interval '20 minutes'
    AND ws.deadline > now();

  -- the fault that cost most of 2026: a reminder scheduled for after the
  -- deadline it is reminding people about
  SELECT count(*) INTO v_after_deadline
  FROM public.email_jobs j
  JOIN public.week_settings ws ON ws.season = j.season AND ws.week = j.week
  WHERE j.status = 'pending' AND j.template_type = ANY (c_types)
    AND j.scheduled_for >= ws.deadline;

  SELECT count(*) INTO v_failed
  FROM public.email_jobs j
  WHERE j.status = 'failed' AND j.template_type = ANY (c_types)
    AND j.updated_at > now() - interval '1 hour';

  v_sent_month := public.email_sends_this_month();
  SELECT count(*) INTO v_sent_today
  FROM public.email_jobs WHERE status = 'sent' AND sent_at >= date_trunc('day', now());
  SELECT rc.monthly_quota, rc.reminder_ceiling_pct INTO v_quota, v_pct FROM public.reminder_config rc;

  SELECT COALESCE(jsonb_agg(s ORDER BY s->>'scheduled_for'), '[]'::jsonb) INTO v_upcoming
  FROM (
    SELECT jsonb_build_object(
             'week', j.week, 'type', j.template_type,
             'scheduled_for', j.scheduled_for, 'pending', count(*)) AS s
    FROM public.email_jobs j
    WHERE j.status = 'pending' AND j.template_type = ANY (c_types)
    GROUP BY j.week, j.template_type, j.scheduled_for
    ORDER BY j.scheduled_for
    LIMIT 20
  ) t;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'processor_last_run', v_last_run,
    'processor_last_success', v_last_ok,
    'processor_last_status', v_last_status,
    'overdue_pending', v_overdue,
    'scheduled_after_deadline', v_after_deadline,
    'failed_last_hour', v_failed,
    'sent_today_utc', v_sent_today,
    'sent_this_month', v_sent_month,
    'monthly_quota', v_quota,
    'reminder_ceiling', v_quota * v_pct / 100,
    'upcoming', v_upcoming
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.reminder_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reminder_health() TO authenticated, service_role;

-- ── watchdog ───────────────────────────────────────────────────────────────
-- Runs on its own cron entry, so it still runs when the processor's does not.
-- Each kind of problem is reported at most once every six hours.
CREATE OR REPLACE FUNCTION public.reminder_watchdog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  h jsonb;
  v_enabled boolean;
  v_problems jsonb := '[]'::jsonb;
  v_new jsonb := '[]'::jsonb;
  p jsonb;
  tok text;
  resp http_response;
  v_html text;
  v_text text;
  a RECORD;
  v_emailed integer := 0;
  v_pending_soon boolean;
BEGIN
  PERFORM public.assert_admin_or_server();
  h := public.reminder_health();

  -- Only call the processor stalled when it has work coming: off-season there
  -- is nothing for it to do and nothing to warn about.
  SELECT EXISTS (
    SELECT 1 FROM public.email_jobs j
    WHERE j.status = 'pending' AND j.template_type = ANY (public.reminder_email_types())
      AND j.scheduled_for <= now() + interval '6 hours'
  ) INTO v_pending_soon;

  IF v_pending_soon AND (h->>'processor_last_success' IS NULL
       OR (h->>'processor_last_success')::timestamptz < now() - interval '15 minutes') THEN
    v_problems := v_problems || jsonb_build_object('kind', 'processor_stalled',
      'summary', 'The reminder processor has not completed a run in the last 15 minutes.',
      'last_success', h->'processor_last_success', 'last_status', h->'processor_last_status');
  END IF;
  IF (h->>'overdue_pending')::int > 0 THEN
    v_problems := v_problems || jsonb_build_object('kind', 'reminders_overdue',
      'summary', format('%s reminder email(s) are more than 20 minutes overdue and unsent.', h->>'overdue_pending'));
  END IF;
  IF (h->>'scheduled_after_deadline')::int > 0 THEN
    v_problems := v_problems || jsonb_build_object('kind', 'scheduled_after_deadline',
      'summary', format('%s reminder email(s) are scheduled for after the deadline they are about.', h->>'scheduled_after_deadline'));
  END IF;
  IF (h->>'failed_last_hour')::int >= 5 THEN
    v_problems := v_problems || jsonb_build_object('kind', 'send_failures',
      'summary', format('%s reminder email(s) failed to send in the last hour.', h->>'failed_last_hour'));
  END IF;
  IF (h->>'sent_this_month')::int >= (h->>'reminder_ceiling')::int THEN
    v_problems := v_problems || jsonb_build_object('kind', 'send_ceiling',
      'summary', format('%s emails sent this month, at or past the reminder ceiling of %s (monthly allowance %s). Reminders are paused; confirmations still send.',
        h->>'sent_this_month', h->>'reminder_ceiling', h->>'monthly_quota'));
  END IF;

  FOR p IN SELECT * FROM jsonb_array_elements(v_problems) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.email_health_alerts x
                   WHERE x.kind = p->>'kind' AND x.created_at > now() - interval '6 hours') THEN
      INSERT INTO public.email_health_alerts (kind, details) VALUES (p->>'kind', p || jsonb_build_object('health', h));
    END IF;
  END LOOP;

  -- anything recorded but not yet emailed, including what the processor logged
  SELECT COALESCE(jsonb_agg(jsonb_build_object('kind', x.kind,
           'summary', COALESCE(x.details->>'summary', x.kind))), '[]'::jsonb)
  INTO v_new
  FROM public.email_health_alerts x
  WHERE NOT x.emailed AND x.created_at > now() - interval '6 hours';

  SELECT rc.alerts_enabled INTO v_enabled FROM public.reminder_config rc;
  IF jsonb_array_length(v_new) = 0 OR NOT COALESCE(v_enabled, true) THEN
    RETURN jsonb_build_object('problems', v_problems, 'emailed', 0);
  END IF;

  SELECT decrypted_secret INTO tok FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF tok IS NULL THEN
    RETURN jsonb_build_object('problems', v_problems, 'emailed', 0, 'error', 'Vault service_role_key missing');
  END IF;

  SELECT string_agg(format('<li>%s</li>', x->>'summary'), ''), string_agg('- ' || (x->>'summary'), E'\n')
  INTO v_html, v_text
  FROM jsonb_array_elements(v_new) x;

  v_html := '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#2A2118">'
    || '<h2 style="color:#4B3621;margin:0 0 12px">Reminder emails need attention</h2>'
    || '<ul>' || v_html || '</ul>'
    || format('<p style="color:#7A6E60;font-size:13px">Sent this month: %s of %s. Last successful processor run: %s. '
              || 'Run <code>select public.reminder_health();</code> in the SQL editor for the full picture.</p>',
              h->>'sent_this_month', h->>'monthly_quota', COALESCE(h->>'processor_last_success', 'never'))
    || '</div>';
  v_text := 'Reminder emails need attention' || E'\n\n' || v_text;

  PERFORM http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  FOR a IN SELECT DISTINCT lower(u.email) AS email FROM public.users u
           WHERE u.is_admin AND u.email IS NOT NULL AND btrim(u.email) <> ''
             AND u.email NOT LIKE '%\_merged\_%'
  LOOP
    BEGIN
      SELECT * INTO resp FROM http((
        'POST', 'https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/send-email',
        ARRAY[http_header('Authorization', 'Bearer ' || tok)],
        'application/json',
        jsonb_build_object('to', a.email,
          'subject', '⚠️ Pigskin Pick Six: reminder emails need attention',
          'html', v_html, 'text', v_text)::text
      )::http_request);
      IF resp.status BETWEEN 200 AND 299 THEN v_emailed := v_emailed + 1; END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- the alert stays unemailed and is retried on the next run
    END;
  END LOOP;

  IF v_emailed > 0 THEN
    UPDATE public.email_health_alerts SET emailed = true
    WHERE NOT emailed AND created_at > now() - interval '6 hours';
  END IF;

  RETURN jsonb_build_object('problems', v_problems, 'emailed', v_emailed);
END;
$function$;
REVOKE ALL ON FUNCTION public.reminder_watchdog() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reminder_watchdog() TO service_role;

-- ── schedules ──────────────────────────────────────────────────────────────
-- Five fields. pg_cron has no seconds field in this form; a sixth field does
-- not error, it silently shifts every other field one place to the left.
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'process-reminder-emails'),
  schedule := '*/2 * * * *',
  command  := $c$SELECT public.run_reminder_processor();$c$
);

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'reminder-watchdog';
SELECT cron.schedule('reminder-watchdog', '7-59/15 * * * *', $c$SELECT public.reminder_watchdog();$c$);
