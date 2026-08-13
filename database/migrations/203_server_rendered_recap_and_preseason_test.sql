-- Migration 203: the recap and the preseason test stop being rendered in a browser
--
-- Finishes what 201 started. 201 moved pick confirmations server-side, but left
-- send-email accepting a body from signed-in admins, because two admin flows
-- still built HTML in the browser and POSTed it:
--
--   sendRecapToAll / sendRecapTest   609 personalized emails, one per paid entrant
--   PreseasonSequence.sendTest       a test of a scheduled preseason touch
--
-- Both are now queue-then-drain, so no email body travels from a browser to the
-- sender, and send-email can restrict content mode to the service role.
--
-- The prose an admin writes is not lost in this — it was never the problem. It
-- already lives in the database (blog_posts.email_rundown, blog_posts.excerpt,
-- preseason_emails.body_html). What changes is that the send path reads it from
-- there by id, rather than trusting whatever HTML a caller hands over.
--
-- ── Why cron drains rather than the admin's browser ────────────────────────
--
-- The `authenticated` role has statement_timeout=8s, so an admin-called drain
-- could only manage a handful of HTTP sends per call. cron runs with the
-- 2-minute default, which is exactly why send_pending_preseason(40) already
-- works that way. send_pending_recap mirrors it. At 609 recipients this also
-- means the send survives the admin closing the tab — previously it did not.
--
-- ── What is deliberately NOT closed ───────────────────────────────────────
--
-- An admin can still queue a row with arbitrary html_content (the week-opened,
-- reminder and results batches all do) and send it by job id. That is a much
-- smaller surface than content mode: it requires an admin session, it goes
-- through RLS, and what was sent stays in the queue to be read back. Closing it
-- entirely means converting pick_reminder, deadline_alert, weekly_results and
-- week_opened to payloads too — worth doing, but a separate piece of work.

-- ── 1. New template type ───────────────────────────────────────────────────

ALTER TABLE public.email_jobs DROP CONSTRAINT IF EXISTS email_jobs_template_type_check;
ALTER TABLE public.email_jobs ADD CONSTRAINT email_jobs_template_type_check
  CHECK (template_type = ANY (ARRAY[
    'pick_reminder', 'deadline_alert', 'weekly_results', 'game_completed',
    'picks_submitted', 'week_opened', 'magic_link', 'password_reset',
    'preseason', 'weekly_recap'
  ]));

-- Progress counting and the drain both filter on the post id inside payload.
CREATE INDEX IF NOT EXISTS idx_email_jobs_recap_post
  ON public.email_jobs ((payload->>'postId'))
  WHERE template_type = 'weekly_recap';

-- ── 2. Queue the recap for every paid entrant ──────────────────────────────

CREATE OR REPLACE FUNCTION public.queue_recap_emails(
  p_post_id uuid,
  p_include_cta boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post record;
  v_cta jsonb := NULL;
  v_queued integer := 0;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT id, week, season, slug, excerpt INTO v_post
  FROM public.blog_posts WHERE id = p_post_id;
  IF v_post.id IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;
  IF v_post.week IS NULL THEN RAISE EXCEPTION 'Post has no week'; END IF;

  -- Don't queue a second copy on a double-click; the caller stamps emailed_at.
  IF EXISTS (
    SELECT 1 FROM public.email_jobs
    WHERE template_type = 'weekly_recap'
      AND payload->>'postId' = p_post_id::text
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'This recap already has pending emails queued';
  END IF;

  IF p_include_cta THEN
    v_cta := public.recap_cta_payload(v_post.week + 1, v_post.season);
  END IF;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, scheduled_for, status, attempts
  )
  SELECT
    r.user_id,
    r.email,
    'weekly_recap',
    CASE WHEN v_cta IS NULL
      THEN format('Week %s Recap — your results & the rundown 🏈', v_post.week)
      ELSE format('Week %s Recap — your results, and Week %s is open 🏈', v_post.week, v_cta->>'week')
    END,
    NULL,
    NULL,
    jsonb_build_object(
      'postId', p_post_id::text,
      'week', v_post.week,
      'displayName', r.display_name,
      'block', r.block,
      'cta', v_cta
    ),
    now(), 'pending', 0
  FROM public.wr_recap_recipients(v_post.week, v_post.season) r
  WHERE r.email IS NOT NULL AND btrim(r.email) <> '';

  GET DIAGNOSTICS v_queued = ROW_COUNT;

  -- Stamped at queue time rather than after the last send. The client used to
  -- set this once its send loop finished, so a loop that died halfway left the
  -- post looking unsent and invited a second full blast.
  UPDATE public.blog_posts SET emailed_at = now() WHERE id = p_post_id;

  RETURN jsonb_build_object('queued', v_queued);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_recap_emails(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_recap_emails(uuid, boolean) TO authenticated;

-- ── 3. The "picks are open" invitation, derived server-side ────────────────
--
-- The client used to compute this and pass it in. It comes out of week_settings,
-- so the server can just look it up. The deadline is passed as a raw timestamp
-- and formatted by the renderer, keeping date formatting in one language.

CREATE OR REPLACE FUNCTION public.recap_cta_payload(p_week integer, p_season integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ws record;
  v_games integer;
BEGIN
  SELECT week, deadline, picks_open INTO v_ws
  FROM public.week_settings WHERE season = p_season AND week = p_week;

  IF v_ws.week IS NULL OR COALESCE(v_ws.picks_open, false) = false THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_games FROM public.games
  WHERE season = p_season AND week = p_week;

  RETURN jsonb_build_object(
    'week', v_ws.week,
    'deadline', v_ws.deadline,
    'totalGames', v_games
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recap_cta_payload(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recap_cta_payload(integer, integer) TO authenticated;

-- ── 4. Single test copy ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.queue_recap_test(
  p_post_id uuid,
  p_to_email text,
  p_include_cta boolean DEFAULT false,
  p_force_no_picks boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post record;
  v_cta jsonb := NULL;
  v_r record;
  v_block jsonb;
  v_job_id uuid;
  v_token uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT id, week, season, slug, excerpt INTO v_post
  FROM public.blog_posts WHERE id = p_post_id;
  IF v_post.id IS NULL THEN RAISE EXCEPTION 'Post not found'; END IF;

  -- Prefer the tester's own results; otherwise borrow the first recipient's, so
  -- the test still shows a realistic card. Matches the old client behaviour.
  SELECT * INTO v_r FROM public.wr_recap_recipients(v_post.week, v_post.season) r
  WHERE lower(r.email) = lower(btrim(p_to_email)) LIMIT 1;
  IF v_r.user_id IS NULL THEN
    SELECT * INTO v_r FROM public.wr_recap_recipients(v_post.week, v_post.season) r LIMIT 1;
  END IF;
  IF v_r.user_id IS NULL THEN
    RETURN NULL;  -- no paid entrants; caller turns this into a friendly message
  END IF;

  v_block := v_r.block;
  IF p_force_no_picks THEN
    v_block := v_block || jsonb_build_object(
      'played', false, 'picks', '[]'::jsonb,
      'wins', 0, 'losses', 0, 'pushes', 0, 'points', 0
    );
  END IF;

  IF p_include_cta THEN
    v_cta := public.recap_cta_payload(v_post.week + 1, v_post.season);
  END IF;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, send_token, scheduled_for, status, attempts
  )
  VALUES (
    NULL,
    btrim(p_to_email),
    'weekly_recap',
    format('%s Week %s Recap — your results',
           CASE WHEN p_force_no_picks THEN '[TEST · no-picks variant]' ELSE '[TEST]' END,
           v_post.week),
    NULL, NULL,
    jsonb_build_object(
      'postId', p_post_id::text,
      'week', v_post.week,
      'displayName', v_r.display_name,
      'block', v_block,
      'cta', v_cta,
      -- Marks this row out of the progress count. send_token can't do that job:
      -- it is cleared once the send succeeds.
      'isTest', true
    ),
    v_token, now(), 'pending', 0
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id, 'send_token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_recap_test(uuid, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_recap_test(uuid, text, boolean, boolean) TO authenticated;

-- ── 5. Progress ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.recap_send_progress(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_sent integer; v_failed integer; v_total integer;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT count(*) FILTER (WHERE status = 'sent'),
         count(*) FILTER (WHERE status = 'failed'),
         count(*)
  INTO v_sent, v_failed, v_total
  FROM public.email_jobs
  WHERE template_type = 'weekly_recap'
    AND payload->>'postId' = p_post_id::text
    AND (payload->>'isTest') IS DISTINCT FROM 'true';

  RETURN jsonb_build_object('sent', v_sent, 'failed', v_failed, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.recap_send_progress(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recap_send_progress(uuid) TO authenticated;

-- ── 6. The drain ───────────────────────────────────────────────────────────
--
-- Mirrors send_pending_preseason, except it passes only the job id: send-email
-- renders the payload itself and marks the row sent, so no HTML is built here.

CREATE OR REPLACE FUNCTION public.send_pending_recap(p_batch integer DEFAULT 40)
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

  FOR j IN SELECT id FROM public.email_jobs
           WHERE template_type = 'weekly_recap'
             AND status = 'pending'
             AND scheduled_for <= now()
           ORDER BY created_at
           LIMIT p_batch
  LOOP
    BEGIN
      SELECT * INTO resp FROM http((
        'POST', url,
        ARRAY[http_header('Authorization', 'Bearer ' || tok)],
        'application/json',
        jsonb_build_object('jobId', j.id)::text
      )::http_request);

      IF resp.status BETWEEN 200 AND 299 THEN
        sent := sent + 1;   -- send-email stamps the row itself
      ELSE
        UPDATE public.email_jobs
          SET status = 'failed', error_message = left(resp.content, 300),
              attempts = attempts + 1, updated_at = now()
          WHERE id = j.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.email_jobs
        SET status = 'failed', error_message = SQLERRM,
            attempts = attempts + 1, updated_at = now()
        WHERE id = j.id;
    END;
  END LOOP;

  RETURN sent;
END;
$$;

REVOKE ALL ON FUNCTION public.send_pending_recap(integer) FROM PUBLIC;

-- Every minute rather than the preseason's five: an admin has just pressed Send
-- and is watching a progress bar. 40/minute clears 609 recipients in ~15 min and
-- stays well inside Resend's rate limit.
SELECT cron.unschedule('recap-send') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recap-send');
SELECT cron.schedule('recap-send', '* * * * *', 'SELECT public.send_pending_recap(40);');

-- ── 7. Preseason test ──────────────────────────────────────────────────────
--
-- The real preseason send already renders in SQL (enqueue_due_preseason_emails
-- + wrap_email_shell). The test copy now goes through the same wrapper instead
-- of the admin's browser rebuilding the shell in TypeScript, which is also how
-- it stops silently drifting from what recipients actually get.

CREATE OR REPLACE FUNCTION public.queue_preseason_test(
  p_preseason_id uuid,
  p_to_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
  v_name text;
  v_unsub text;
  v_filled text;
  v_job_id uuid;
  v_token uuid := gen_random_uuid();
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'Admins only';
  END IF;

  SELECT * INTO t FROM public.preseason_emails WHERE id = p_preseason_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'Preseason touch not found'; END IF;

  SELECT COALESCE(NULLIF(btrim(u.display_name), ''), 'there'),
         'https://pigskinpicksix.com/unsubscribe?t=' || u.unsubscribe_token::text
  INTO v_name, v_unsub
  FROM public.users u WHERE u.id = auth.uid();

  v_filled := replace(t.body_html, '{{name}}', COALESCE(v_name, 'there'));

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    send_token, scheduled_for, status, attempts
  )
  VALUES (
    auth.uid(),
    btrim(p_to_email),
    'preseason',
    '[TEST] ' || t.subject,
    public.wrap_email_shell('Sign Up', v_filled, v_unsub),
    regexp_replace(v_filled, '<[^>]*>', '', 'g'),
    v_token, now(), 'pending', 0
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id, 'send_token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_preseason_test(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_preseason_test(uuid, text) TO authenticated;
