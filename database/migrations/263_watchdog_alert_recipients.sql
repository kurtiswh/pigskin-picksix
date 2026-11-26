-- Migration 263: choose who the reminder watchdog emails
--
-- Migration 261's watchdog mailed every admin account, which includes
-- accounts that do not maintain the site and a test account. An alert that
-- says "run reminder_health() in the SQL editor" is only useful to the person
-- who can.
--
-- reminder_config.alert_emails names the recipients. Left empty it falls back
-- to every admin, so a fresh install still tells someone.
--
-- The recipient list is set in the database, not here: an address does not
-- belong in a public repository.
--
--   UPDATE public.reminder_config SET alert_emails = ARRAY['you@example.com'];

ALTER TABLE public.reminder_config ADD COLUMN IF NOT EXISTS alert_emails text[];
COMMENT ON COLUMN public.reminder_config.alert_emails IS
  'Who reminder_watchdog emails. NULL or empty means every admin account.';

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
  -- reminder_config.alert_emails when it is set; otherwise every admin account.
  FOR a IN
    SELECT DISTINCT lower(btrim(e)) AS email
    FROM unnest(COALESCE(
           (SELECT NULLIF(rc.alert_emails, '{}'::text[]) FROM public.reminder_config rc),
           (SELECT array_agg(u.email) FROM public.users u
            WHERE u.is_admin AND u.email IS NOT NULL AND btrim(u.email) <> ''
              AND u.email NOT LIKE '%\_merged\_%'))) AS e
    WHERE e IS NOT NULL AND btrim(e) <> ''
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
