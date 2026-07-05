-- Migration 170: preseason signup email sequence (scheduled drip to all users)
--
-- Admins define "touches" (subject + rich body + send time). pg_cron enqueues a
-- personalized copy per user into email_jobs when a touch is due, then sends them
-- in throttled batches by calling the deployed send-email edge function (via the
-- http extension + the Vault service token). Self-contained — no new edge fn.
--
-- Recipients = ALL users with an email (deduped by email). Body supports a
-- {{name}} token. Nothing sends until a touch's send_at passes AND the cron runs.

CREATE TABLE IF NOT EXISTS public.preseason_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season integer NOT NULL,
  label text,
  subject text NOT NULL,
  body_html text NOT NULL,
  send_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',   -- scheduled | enqueued | canceled
  enqueued_at timestamptz,
  recipients_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.preseason_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage preseason emails" ON public.preseason_emails;
CREATE POLICY "Admins manage preseason emails" ON public.preseason_emails
  FOR ALL USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.preseason_emails TO authenticated;

-- Enqueue a personalized email_jobs row per user for every due, still-scheduled touch.
CREATE OR REPLACE FUNCTION public.enqueue_due_preseason_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  c integer;
  touches integer := 0;
BEGIN
  FOR t IN SELECT * FROM public.preseason_emails
           WHERE status = 'scheduled' AND send_at <= now()
  LOOP
    INSERT INTO public.email_jobs (user_id, email, template_type, subject, html_content, text_content, scheduled_for, status, attempts)
    SELECT DISTINCT ON (lower(u.email))
           u.id, u.email, 'preseason', t.subject,
           replace(t.body_html, '{{name}}', COALESCE(NULLIF(btrim(u.display_name), ''), 'there')),
           regexp_replace(replace(t.body_html, '{{name}}', COALESCE(NULLIF(btrim(u.display_name), ''), 'there')), '<[^>]*>', '', 'g'),
           now(), 'pending', 0
    FROM public.users u
    WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
    ORDER BY lower(u.email), u.created_at;

    GET DIAGNOSTICS c = ROW_COUNT;
    UPDATE public.preseason_emails
      SET status = 'enqueued', enqueued_at = now(), recipients_count = c, updated_at = now()
      WHERE id = t.id;
    touches := touches + 1;
  END LOOP;
  RETURN touches;
END;
$$;

-- Send a throttled batch of pending 'preseason' jobs via the send-email edge function.
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

GRANT EXECUTE ON FUNCTION public.enqueue_due_preseason_emails() TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_pending_preseason(integer) TO authenticated;

-- Cron: check for due touches every 10 min; drain the send queue every 5 min.
-- (No-ops until a touch's send_at passes, so this is safe to schedule now.)
SELECT cron.schedule('preseason-enqueue', '*/10 * * * *', $$SELECT public.enqueue_due_preseason_emails();$$);
SELECT cron.schedule('preseason-send', '*/5 * * * *', $$SELECT public.send_pending_preseason(40);$$);

-- Allow the 'preseason' email_jobs type (the CHECK constraint predates it).
ALTER TABLE public.email_jobs DROP CONSTRAINT IF EXISTS email_jobs_template_type_check;
ALTER TABLE public.email_jobs ADD CONSTRAINT email_jobs_template_type_check
  CHECK (template_type = ANY (ARRAY['pick_reminder','deadline_alert','weekly_results','game_completed','picks_submitted','week_opened','magic_link','password_reset','preseason']));
