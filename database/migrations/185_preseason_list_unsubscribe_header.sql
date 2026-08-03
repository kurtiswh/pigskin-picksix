-- Migration 185: List-Unsubscribe header on the preseason blast
--
-- WHY (preseason only):
--   1,827 of the 1,933 addresses in the system have never registered an
--   account — they are historical participants from the archive import. The
--   preseason blast is the one send that reaches cold, never-opted-in
--   addresses, so it is the one that needs the mail client's native
--   "Unsubscribe" control. That control is what people press INSTEAD of the
--   spam button, which is what actually protects the sending domain.
--
--   Requires the matching send-email Edge Function change (accepts
--   `unsubscribeUrl` and sets the header). Until that function is deployed
--   the extra field is simply ignored by the current version — safe either way.

CREATE OR REPLACE FUNCTION public.send_pending_preseason(p_batch integer DEFAULT 40)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  FOR j IN SELECT ej.*, u.unsubscribe_token
           FROM public.email_jobs ej
           LEFT JOIN public.users u ON u.id = ej.user_id
           WHERE ej.template_type = 'preseason' AND ej.status = 'pending' AND ej.scheduled_for <= now()
           ORDER BY ej.created_at
           LIMIT p_batch
  LOOP
    BEGIN
      SELECT * INTO resp FROM http((
        'POST', url,
        ARRAY[http_header('Authorization', 'Bearer ' || tok)],
        'application/json',
        jsonb_strip_nulls(jsonb_build_object(
          'to', j.email, 'subject', j.subject, 'html', j.html_content,
          'text', j.text_content, 'from', 'Pigskin Pick Six <admin@pigskinpicksix.com>',
          'unsubscribeUrl', CASE WHEN j.unsubscribe_token IS NULL THEN NULL
                                 ELSE 'https://pigskinpicksix.com/unsubscribe?t=' || j.unsubscribe_token::text END
        ))::text
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
$function$;
