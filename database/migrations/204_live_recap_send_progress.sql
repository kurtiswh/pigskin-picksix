-- Migration 204: make the recap progress bar live again
--
-- 203 moved the recap send to a once-a-minute cron drain. That fixed the real
-- problem (a 609-email send dying with the browser tab) but made the progress
-- bar useless: it sat still for a minute, jumped 40, and sat still again.
--
-- The fix is not to put sending back in the browser. It is to let the browser
-- ask the server to drain, in small fast batches, while the admin is watching:
--
--   * the browser never sees an email body — it says "send some more", not
--     "send this HTML", so nothing from 201/203 is given back
--   * each call returns its own counts, so the bar moves without a second
--     round trip
--   * the cron stays exactly as it was. Close the tab and the send continues;
--     it is now the safety net rather than the engine
--
-- Two things had to change to allow that.
--
-- FOR UPDATE SKIP LOCKED. With both the browser and the cron draining, two
-- callers could read the same pending row and both send it. send-email is
-- idempotent on status='sent', but only if the first send has *finished* — two
-- genuinely concurrent drains would each see 'pending' and each send. Locking
-- the claimed rows makes the other drain skip them instead.
--
-- A jsonb return. The old integer told the caller how many it sent but nothing
-- about what was left, so a live bar needed a second query per batch.

-- Return type changes, so the old signature has to go. The cron job calls this
-- by name and picks up the new one on its next tick.
DROP FUNCTION IF EXISTS public.send_pending_recap(integer);

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
  -- auth.uid() is NULL for cron and the service role, which are trusted. A real
  -- session has to belong to an admin. anon is never granted execute at all.
  IF auth.uid() IS NOT NULL AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

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
        v_sent := v_sent + 1;   -- send-email stamps the row itself
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

REVOKE ALL ON FUNCTION public.send_pending_recap(integer, uuid) FROM PUBLIC;
-- Admins only (enforced in the body); anon is deliberately not granted.
GRANT EXECUTE ON FUNCTION public.send_pending_recap(integer, uuid) TO authenticated;

COMMENT ON FUNCTION public.send_pending_recap(integer, uuid) IS
  'Drain queued weekly_recap jobs by asking send-email to send them by id. '
  'Called in small batches by the admin''s browser for a live progress bar, and '
  'in bulk by the recap-send cron so the send finishes with the tab closed.';

-- Repoint the cron at the new signature.
SELECT cron.unschedule('recap-send') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recap-send');
SELECT cron.schedule('recap-send', '* * * * *', 'SELECT public.send_pending_recap(40);');
