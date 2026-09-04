-- Migration 225: why 2,172 reminder jobs were pending, and the three causes
--
-- Week 1 of 2026 held 2,172 pending pick_reminder jobs for 362 people:
--
--   724 @ Sep 4 16:00  (2x per person)  <- doubled
--   724 @ Sep 5 14:00  (2x per person)  <- doubled
--   362 @ Sep 7 18:43                   <- AFTER the deadline
--   362 @ Sep 8 16:43                   <- AFTER the deadline
--
-- 1. queue_pick_reminders had no guard against re-queueing. It ran twice
--    (Sep 1 19:06 and Sep 2 00:10) and doubled every slot. Fixed below with
--    the same NOT EXISTS guard queue_unsubmitted_pick_nudges uses.
--
-- 2. The Sep 7/8 slots were queued Sep 1 19:00 against the deadline in force
--    then (Sep 8 18:43, set automatically while games were being selected).
--    The deadline later moved to Sep 5 16:00; the jobs kept their old
--    scheduled_for. They would have sent "your picks are due" two and three
--    days AFTER the week closed. The staleness floor in process-reminders
--    only suppresses jobs that are LATE, not ones scheduled into the future,
--    so it would not have caught these.
--
-- 3. Nothing ever invoked process-reminders, so nothing sent and the backlog
--    just accumulated. Scheduling it is a workflow change, handled separately.
--
-- Cleanup here cancels rather than deletes: a cancelled row is auditable and
-- keeps the "already queued" guard meaningful.

-- ── cause 1: stop the doubling ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.queue_pick_reminders(
  p_week integer,
  p_season integer,
  p_reminder_hours integer[] DEFAULT '{}'::integer[],
  p_alert_hours integer[] DEFAULT '{}'::integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deadline timestamptz;
  v_queued integer;
BEGIN
  SELECT deadline INTO v_deadline
  FROM public.week_settings WHERE season = p_season AND week = p_week;
  IF v_deadline IS NULL THEN
    RAISE EXCEPTION 'Week % of % has no deadline set', p_week, p_season;
  END IF;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, scheduled_for, status, attempts, week, season
  )
  SELECT a.user_id, a.email, h.kind,
         CASE WHEN h.kind = 'deadline_alert'
           THEN format('⏰ %s hours left - Week %s picks due!', h.hours, p_week)
           ELSE format('🏈 Week %s Picks Due Soon!', p_week)
         END,
         NULL, NULL,
         jsonb_build_object(
           'userDisplayName', a.display_name,
           'week', p_week, 'season', p_season,
           'deadline', v_deadline,
           'hoursLeft', h.hours
         ),
         v_deadline - make_interval(hours => h.hours),
         'pending', 0, p_week, p_season
  FROM public.notification_audience('pick_reminders', p_season) a
  CROSS JOIN (
    SELECT unnest(p_reminder_hours) AS hours, 'pick_reminder' AS kind
    UNION ALL
    SELECT unnest(p_alert_hours), 'deadline_alert'
  ) h
  WHERE v_deadline - make_interval(hours => h.hours) > now()
    AND NOT EXISTS (
      SELECT 1 FROM public.picks pk
      WHERE pk.user_id = a.user_id AND pk.week = p_week
        AND pk.season = p_season AND pk.submitted = true
    )
    -- NEW: one job per person, per kind, per slot, per week.
    AND NOT EXISTS (
      SELECT 1 FROM public.email_jobs j
      WHERE j.user_id = a.user_id
        AND j.template_type = h.kind
        AND j.week = p_week AND j.season = p_season
        AND j.scheduled_for = v_deadline - make_interval(hours => h.hours)
        AND j.status <> 'cancelled'
    );

  GET DIAGNOSTICS v_queued = ROW_COUNT;
  RETURN jsonb_build_object('queued', v_queued);
END;
$function$;

-- ── cause 2: cancel jobs that would fire after their own deadline ─────────
UPDATE public.email_jobs j
SET status = 'cancelled'
FROM public.week_settings ws
WHERE j.status = 'pending'
  AND j.template_type IN ('pick_reminder','deadline_alert')
  AND ws.season = j.season AND ws.week = j.week
  AND j.scheduled_for > ws.deadline;

-- ── cause 1 cleanup: collapse existing duplicates, keeping the oldest ─────
UPDATE public.email_jobs
SET status = 'cancelled'
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (
      PARTITION BY user_id, template_type, week, season, scheduled_for
      ORDER BY created_at, id
    ) AS rn
    FROM public.email_jobs
    WHERE status = 'pending'
      AND template_type IN ('pick_reminder','deadline_alert')
  ) d
  WHERE d.rn > 1
);
