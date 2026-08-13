-- Migration 205: stop anon being able to trigger a mass send
--
-- FOUND WHILE TESTING 204. `REVOKE ALL ON FUNCTION ... FROM PUBLIC` does not do
-- what it looks like it does on Supabase. The platform ships
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role
--
-- so every new function in `public` gets a grant to `anon` *by name*. Revoking
-- from PUBLIC leaves that grant untouched. Every function in 201/203/204 was
-- therefore callable by an unauthenticated request, and so is
-- send_pending_preseason, which predates all of this.
--
-- Most of them survive that on their body guard alone: queue_recap_emails,
-- queue_recap_test, recap_send_progress and queue_preseason_test all open with
-- `IF NOT is_current_user_admin() THEN RAISE`, which is false for anon, and
-- queue_pick_confirmation requires auth.uid(). Defence in depth held.
--
-- Two did not:
--
--   send_pending_recap      Its guard was `auth.uid() IS NOT NULL AND NOT
--                           is_current_user_admin()`, written on the assumption
--                           that a null uid means cron. anon has a null uid
--                           too, so anon passed the guard and could drain the
--                           recap queue on demand.
--   send_pending_preseason  No guard whatsoever. Anyone on the internet could
--                           push the preseason blast out in 40s.
--
-- Neither lets a caller choose a recipient or write a body — the jobs are
-- already queued and server-rendered — but "unauthenticated stranger decides
-- when 1,900 emails go out" is not a control anyone intended to publish.
--
-- The fix is both halves: take the grant away, and stop guarding on uid.

-- ── 1. A guard that can tell anon from cron ────────────────────────────────
--
-- auth.uid() cannot: it is NULL for anon and for cron alike. The JWT role claim
-- can — PostgREST always sets one, cron and direct service-role connections
-- never do.

CREATE OR REPLACE FUNCTION public.assert_admin_or_server()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  v_role := nullif(current_setting('request.jwt.claims', true), '')::json->>'role';

  -- No claim at all: cron, or a direct service-role connection. Trusted.
  IF v_role IS NULL OR v_role = 'service_role' THEN
    RETURN;
  END IF;

  -- Anything arriving over PostgREST as anon or authenticated must be an admin.
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_admin_or_server() FROM PUBLIC, anon;

-- ── 2. Re-guard the two drains ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.send_pending_recap(
  p_batch integer DEFAULT 40,
  p_post_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j record;
  tok text;
  resp http_response;
  url text := 'https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/send-email';
  v_sent integer := 0;
  v_failed integer := 0;
  v_remaining integer;
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT decrypted_secret INTO tok FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF tok IS NULL THEN RAISE EXCEPTION 'Vault service_role_key missing'; END IF;
  PERFORM http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');

  FOR j IN
    SELECT id FROM public.email_jobs
    WHERE template_type = 'weekly_recap'
      AND status = 'pending'
      AND scheduled_for <= now()
      AND (p_post_id IS NULL OR payload->>'postId' = p_post_id::text)
    ORDER BY created_at
    LIMIT p_batch
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT * INTO resp FROM http((
        'POST', url,
        ARRAY[http_header('Authorization', 'Bearer ' || tok)],
        'application/json',
        jsonb_build_object('jobId', j.id)::text
      )::http_request);

      IF resp.status BETWEEN 200 AND 299 THEN
        v_sent := v_sent + 1;
      ELSE
        UPDATE public.email_jobs
          SET status = 'failed', error_message = left(resp.content, 300),
              attempts = attempts + 1, updated_at = now()
          WHERE id = j.id;
        v_failed := v_failed + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.email_jobs
        SET status = 'failed', error_message = SQLERRM,
            attempts = attempts + 1, updated_at = now()
        WHERE id = j.id;
      v_failed := v_failed + 1;
    END;
  END LOOP;

  SELECT count(*) INTO v_remaining
  FROM public.email_jobs
  WHERE template_type = 'weekly_recap'
    AND status = 'pending'
    AND (p_post_id IS NULL OR payload->>'postId' = p_post_id::text);

  RETURN jsonb_build_object('sent', v_sent, 'failed', v_failed, 'remaining', v_remaining);
END;
$$;

-- send_pending_preseason keeps its existing body; it only needed a doorman.
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
  PERFORM public.assert_admin_or_server();

  SELECT decrypted_secret INTO tok FROM vault.decrypted_secrets WHERE name = 'service_role_key';
  IF tok IS NULL THEN RAISE EXCEPTION 'Vault service_role_key missing'; END IF;
  PERFORM http_set_curlopt('CURLOPT_TIMEOUT_MS', '25000');

  FOR j IN SELECT ej.*, u.unsubscribe_token
           FROM public.email_jobs ej
           LEFT JOIN public.users u ON u.id = ej.user_id
           WHERE ej.template_type = 'preseason' AND ej.status = 'pending' AND ej.scheduled_for <= now()
           ORDER BY ej.created_at
           LIMIT p_batch
           FOR UPDATE OF ej SKIP LOCKED
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
        UPDATE public.email_jobs SET status = 'failed', error_message = left(resp.content, 300),
               attempts = attempts + 1, updated_at = now() WHERE id = j.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.email_jobs SET status = 'failed', error_message = SQLERRM,
             attempts = attempts + 1, updated_at = now() WHERE id = j.id;
    END;
  END LOOP;

  RETURN sent;
END;
$$;

-- ── 3. Take the default grant off anon, function by function ───────────────
--
-- CREATE OR REPLACE above re-applies the schema default, so these must come
-- last. queue_anonymous_pick_confirmation is the deliberate exception: an
-- unauthenticated visitor confirming their own picks is the whole point of it.

REVOKE EXECUTE ON FUNCTION public.send_pending_recap(integer, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_pending_preseason(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_recap_emails(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_recap_test(uuid, text, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recap_send_progress(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recap_cta_payload(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_preseason_test(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.queue_pick_confirmation(integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assert_confirmation_rate_ok(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_due_preseason_emails() FROM anon;

GRANT EXECUTE ON FUNCTION public.send_pending_recap(integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.assert_admin_or_server() IS
  'Doorman for functions cron and admins share. Trusts a request with no JWT '
  'role claim (cron, direct service-role) and requires is_admin otherwise. '
  'Guarding on auth.uid() does not work here: it is NULL for anon and cron alike.';

-- These two predate this work and were created without revoking PUBLIC, so anon
-- inherited EXECUTE that way rather than through the named grant above.
REVOKE EXECUTE ON FUNCTION public.send_pending_preseason(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_due_preseason_emails() FROM PUBLIC;
