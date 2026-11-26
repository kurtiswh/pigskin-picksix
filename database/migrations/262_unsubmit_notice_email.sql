-- Migration 262: email a player the moment their sheet stops being submitted
--
-- Editing a submitted pick unsubmits the whole sheet. The pick sheet says so
-- twice (a confirm dialog, then an alert), and that works: of 1,106 unsubmits
-- in 2026 the median player was submitted again 47 seconds later. But twelve
-- sheets were never resubmitted before the deadline, and each of those players
-- had a "Picks Confirmed" email from before the edit as the last word in their
-- inbox. A dialog leaves no record. This does.
--
-- Decisions from the commissioner:
--   * Every unsubmit gets a notice, straight away. Not a grace period: the
--     point is a record in the inbox each time.
--   * So it has to arrive BEFORE the next confirmation, or the newest email
--     would say "not submitted" about a sheet that is. A two-minute cron cannot
--     do that against a 47-second median, so the trigger asks pg_net to call
--     the processor as soon as the unsubmit commits. Cron is the fallback, and
--     the fallback skips anyone who has submitted again in the meantime.
--
-- The trigger lives on picks because that is the one place every path passes
-- through: the pick sheet, an admin acting on a player's sheet, anything added
-- later. It must never be the reason a pick fails to save, so everything it
-- does is inside an exception block.

CREATE EXTENSION IF NOT EXISTS pg_net;

ALTER TABLE public.email_jobs DROP CONSTRAINT IF EXISTS email_jobs_template_type_check;
ALTER TABLE public.email_jobs ADD CONSTRAINT email_jobs_template_type_check
  CHECK (template_type = ANY (ARRAY[
    'pick_reminder','deadline_alert','weekly_results','game_completed',
    'picks_submitted','week_opened','password_reset','preseason','weekly_recap',
    'picks_unsubmitted','picks_unsubmit_notice'
  ]));

CREATE OR REPLACE FUNCTION public.queue_unsubmit_notice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  tok text;
  r RECORD;
BEGIN
  -- Cheap exit: the scorer updates hundreds of picks at a time and none of
  -- those statements change `submitted`.
  IF NOT EXISTS (
    SELECT 1 FROM new_rows n JOIN old_rows o ON o.id = n.id
    WHERE o.submitted IS TRUE AND n.submitted IS NOT TRUE
  ) THEN
    RETURN NULL;
  END IF;

  -- Only changes made through the app. Maintenance SQL and server jobs carry no
  -- end-user claim, and a data fix that touches many sheets must not mail the
  -- league.
  v_role := nullif(current_setting('request.jwt.claims', true), '')::json->>'role';
  IF v_role IS DISTINCT FROM 'authenticated' THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO tok FROM vault.decrypted_secrets WHERE name = 'service_role_key';

    FOR r IN
      WITH changed AS (
        SELECT DISTINCT n.user_id, n.week, n.season
        FROM new_rows n JOIN old_rows o ON o.id = n.id
        WHERE o.submitted IS TRUE AND n.submitted IS NOT TRUE
      ),
      eligible AS (
        SELECT c.user_id, c.week, c.season, ws.deadline,
               lower(u.email) AS email,
               COALESCE(NULLIF(btrim(u.display_name), ''), split_part(u.email, '@', 1)) AS name
        FROM changed c
        JOIN public.users u ON u.id = c.user_id
        JOIN public.week_settings ws ON ws.week = c.week AND ws.season = c.season
        WHERE ws.deadline > now()                       -- still time to do something about it
          AND u.email IS NOT NULL AND btrim(u.email) <> ''
          AND u.email NOT LIKE '%\_merged\_%'
          -- the sheet as a whole is now unsubmitted
          AND NOT EXISTS (SELECT 1 FROM public.picks p
                          WHERE p.user_id = c.user_id AND p.week = c.week
                            AND p.season = c.season AND p.submitted)
          -- a runaway client cannot turn this into a mail cannon
          AND (SELECT count(*) FROM public.email_jobs j
               WHERE j.user_id = c.user_id AND j.template_type = 'picks_unsubmit_notice'
                 AND j.created_at > now() - interval '1 hour') < 6
      )
      INSERT INTO public.email_jobs (
        user_id, email, template_type, subject, html_content, text_content,
        payload, scheduled_for, status, attempts, week, season, claimed_at
      )
      SELECT e.user_id, e.email, 'picks_unsubmit_notice',
             format('⚠️ Your Week %s picks are no longer submitted', e.week),
             NULL, NULL,
             jsonb_build_object(
               'userDisplayName', e.name,
               'week', e.week, 'season', e.season,
               'deadline', e.deadline,
               'unsubmittedAt', now(),
               'pickCount', pk.pick_count,
               'hasLock', pk.has_lock,
               'picks', pk.picks
             ),
             -- claimed_at is set so the cron path leaves the row to the
             -- immediate send below; it takes over only if that never lands.
             now(), 'pending', 0, e.week, e.season, now()
      FROM eligible e
      CROSS JOIN LATERAL (
        SELECT count(*) AS pick_count,
               COALESCE(bool_or(COALESCE(p.is_lock, false)), false) AS has_lock,
               COALESCE(jsonb_agg(jsonb_build_object(
                   'team', p.selected_team,
                   'spread', COALESCE(g.spread, 0),
                   'isLock', COALESCE(p.is_lock, false),
                   'matchup', g.away_team || ' @ ' || g.home_team
                 ) ORDER BY g.kickoff_time), '[]'::jsonb) AS picks
        FROM public.picks p
        JOIN public.games g ON g.id = p.game_id
        WHERE p.user_id = e.user_id AND p.week = e.week AND p.season = e.season
      ) pk
      RETURNING id
    LOOP
      -- Queued inside this transaction, sent by pg_net's worker after it
      -- commits, so the processor finds the row when it looks.
      IF tok IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/process-reminders',
          body := jsonb_build_object('jobId', r.id),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || tok),
          timeout_milliseconds := 20000
        );
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- Saving a pick matters more than mailing about it.
    RAISE WARNING 'queue_unsubmit_notice failed: %', SQLERRM;
  END;

  RETURN NULL;
END;
$function$;

-- Statement-level with transition tables: one PATCH unsubmits all six rows,
-- and that is one notice, not six.
DROP TRIGGER IF EXISTS trg_queue_unsubmit_notice ON public.picks;
CREATE TRIGGER trg_queue_unsubmit_notice
  AFTER UPDATE ON public.picks
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.queue_unsubmit_notice();

-- The immediate send. First attempt only, and only while the sheet is still
-- unsubmitted: if the player has already submitted again the newer email is the
-- confirmation, and this notice would contradict it. The row is then left for
-- claim_due_reminder_emails, which cancels it for the same reason.
CREATE OR REPLACE FUNCTION public.claim_unsubmit_notice(p_job_id uuid)
RETURNS TABLE (
  job_id uuid, to_email text, job_type text, job_subject text,
  job_payload jsonb, job_week integer, job_season integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_quota integer;
  v_pct integer;
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT rc.monthly_quota, rc.reminder_ceiling_pct INTO v_quota, v_pct
  FROM public.reminder_config rc;
  IF v_quota IS NOT NULL AND public.email_sends_this_month() >= v_quota * v_pct / 100 THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.email_jobs j
  SET claimed_at = now(), attempts = COALESCE(j.attempts, 0) + 1
  WHERE j.id = p_job_id
    AND j.status = 'pending'
    AND j.template_type = 'picks_unsubmit_notice'
    AND COALESCE(j.attempts, 0) = 0
    AND NOT EXISTS (SELECT 1 FROM public.picks p
                    WHERE p.user_id = j.user_id AND p.week = j.week
                      AND p.season = j.season AND p.submitted)
  RETURNING j.id, j.email, j.template_type, j.subject, j.payload, j.week, j.season;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_unsubmit_notice(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_unsubmit_notice(uuid) TO service_role;
