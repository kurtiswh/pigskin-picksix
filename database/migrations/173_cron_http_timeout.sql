-- Migration 173: raise the cron http() timeout (was the 5s default -> false "failed" runs)
--
-- The http extension defaults to a 5s timeout; live scoring (CFBD fetch + score)
-- and stats can exceed that, logging failed cron runs even though the edge fn may
-- have run. Centralize the edge-function trigger in invoke_edge() with a 25s
-- timeout, and point the 4 http-driven cron jobs at it. Also bump the timeout in
-- the preseason batch sender.

CREATE OR REPLACE FUNCTION public.invoke_edge(p_fn text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tok text;
  resp http_response;
BEGIN
  SELECT decrypted_secret INTO tok FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF tok IS NULL THEN RAISE EXCEPTION 'Vault service_role_key missing'; END IF;
  PERFORM http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');
  SELECT * INTO resp FROM http((
    'POST',
    'https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/' || p_fn,
    ARRAY[http_header('Authorization', 'Bearer ' || tok)],
    'application/json', '{}')::http_request);
  RETURN resp.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invoke_edge(text) TO authenticated;

-- Point the http-driven cron jobs at invoke_edge (keeps their schedules).
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'live-scoring-thu-sat'),   command := $c$SELECT public.invoke_edge('live-score-updater');$c$);
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'live-scoring-sunday'),     command := $c$SELECT public.invoke_edge('live-score-updater');$c$);
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'update-game-statistics'),  command := $c$SELECT public.invoke_edge('update-game-stats');$c$);
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'process-reminder-emails'), command := $c$SELECT public.invoke_edge('process-reminders');$c$);

-- Preseason batch sender: same 25s timeout.
CREATE OR REPLACE FUNCTION public.send_pending_preseason(p_batch integer DEFAULT 40)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j record;
  tok text;
  resp http_response;
  url text := 'https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/send-email';
  sent integer := 0;
BEGIN
  SELECT decrypted_secret INTO tok FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF tok IS NULL THEN RAISE EXCEPTION 'Vault service_role_key missing'; END IF;
  PERFORM http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');

  FOR j IN SELECT * FROM public.email_jobs
           WHERE template_type = 'preseason' AND status = 'pending' AND scheduled_for <= now()
           ORDER BY created_at
           LIMIT p_batch
  LOOP
    BEGIN
      SELECT * INTO resp FROM http((
        'POST', url,
        ARRAY[http_header('Authorization', 'Bearer ' || tok)],
        'application/json',
        jsonb_build_object('to', j.email, 'subject', j.subject, 'html', j.html_content,
                           'text', j.text_content, 'from', 'Pigskin Pick Six <admin@pigskinpicksix.com>')::text
      )::http_request);
      IF resp.status BETWEEN 200 AND 299 THEN
        UPDATE public.email_jobs SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = j.id;
        sent := sent + 1;
      ELSE
        UPDATE public.email_jobs SET status = 'failed', error_message = left(resp.content, 300), attempts = attempts + 1, updated_at = now() WHERE id = j.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.email_jobs SET status = 'failed', error_message = SQLERRM, attempts = attempts + 1, updated_at = now() WHERE id = j.id;
    END;
  END LOOP;
  RETURN sent;
END;
$$;
