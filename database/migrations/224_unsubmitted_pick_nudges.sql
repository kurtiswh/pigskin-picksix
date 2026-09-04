-- Migration 224: emails for picks that are saved but never submitted
--
-- The existing pick_reminder already skips submitted players, so these people
-- do get mail -- but its copy is written for an EMPTY sheet ("select 6 games,
-- choose a Lock, submit"). Someone looking at six saved picks and a Lock reads
-- that, concludes it does not apply, and deletes it. Carol Weeks and 8 others
-- sat with complete, unentered sheets.
--
-- Three decisions from the commissioner, encoded here:
--   * Unsubscribes are honored. notification_audience cannot be reused because
--     it INNER JOINs a Paid leaguesafe_payment, and picks count during the
--     grace period regardless of payment -- so the preference checks are
--     replicated without the payment join.
--   * Payment is never mentioned in these emails; the watermark handles that.
--   * Distinct template_type so Week Review can report on them separately.

ALTER TABLE public.email_jobs DROP CONSTRAINT IF EXISTS email_jobs_template_type_check;
ALTER TABLE public.email_jobs ADD CONSTRAINT email_jobs_template_type_check
  CHECK (template_type = ANY (ARRAY[
    'pick_reminder','deadline_alert','weekly_results','game_completed',
    'picks_submitted','week_opened','password_reset','preseason','weekly_recap',
    'picks_unsubmitted'
  ]));

-- Who has picks saved and nothing submitted, with enough detail for the copy
-- to be specific about what is missing.
CREATE OR REPLACE FUNCTION public.unsubmitted_pick_audience(
  p_week integer,
  p_season integer
)
RETURNS TABLE (
  user_id uuid, email text, display_name text,
  pick_count bigint, has_lock boolean, tier text, picks jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    u.id, u.email, COALESCE(NULLIF(btrim(u.display_name),''),'there'),
    count(p.id),
    bool_or(COALESCE(p.is_lock,false)),
    CASE
      WHEN count(p.id) = 6 AND bool_or(COALESCE(p.is_lock,false)) THEN 'complete'
      WHEN count(p.id) = 6 THEN 'no_lock'
      ELSE 'partial'
    END,
    jsonb_agg(
      jsonb_build_object(
        'team', p.selected_team,
        'spread', COALESCE(g.spread,0),
        'isLock', COALESCE(p.is_lock,false),
        'matchup', g.away_team||' @ '||g.home_team
      ) ORDER BY g.kickoff_time
    )
  FROM public.users u
  JOIN public.picks p ON p.user_id = u.id AND p.week = p_week AND p.season = p_season
  JOIN public.games g ON g.id = p.game_id
  WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
    -- same preference gates as notification_audience, minus the payment join
    AND COALESCE((u.preferences->>'email_notifications')::boolean, true) = true
    AND COALESCE((u.preferences->>'pick_reminders')::boolean, true) = true
  GROUP BY u.id, u.email, u.display_name
  HAVING count(p.id) FILTER (WHERE p.submitted) = 0;
$function$;

REVOKE ALL ON FUNCTION public.unsubmitted_pick_audience(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unsubmitted_pick_audience(integer,integer) TO authenticated, service_role;

-- Queue one tier. p_complete_only supports the final ~45-minute call, which
-- goes to people one click from a full score and not to someone still three
-- picks short.
CREATE OR REPLACE FUNCTION public.queue_unsubmitted_pick_nudges(
  p_season integer,
  p_week integer,
  p_hours_before numeric,
  p_complete_only boolean DEFAULT false,
  p_send_now boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deadline timestamptz;
  v_when timestamptz;
  v_queued integer;
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT deadline INTO v_deadline
  FROM public.week_settings WHERE season = p_season AND week = p_week;
  IF v_deadline IS NULL THEN
    RAISE EXCEPTION 'Week % of % has no deadline set', p_week, p_season;
  END IF;

  v_when := CASE WHEN p_send_now THEN now()
                 ELSE v_deadline - make_interval(mins => (p_hours_before * 60)::int) END;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, scheduled_for, status, attempts, week, season
  )
  SELECT
    a.user_id, a.email, 'picks_unsubmitted',
    CASE a.tier
      WHEN 'complete' THEN format('⚠️ Your Week %s picks are saved — but NOT submitted', p_week)
      WHEN 'no_lock'  THEN format('One thing missing: your Week %s Lock', p_week)
      ELSE format('You''re %s pick%s away — Week %s closes soon',
                  6 - a.pick_count, CASE WHEN 6 - a.pick_count = 1 THEN '' ELSE 's' END, p_week)
    END,
    NULL, NULL,
    jsonb_build_object(
      'userDisplayName', a.display_name,
      'week', p_week, 'season', p_season,
      'deadline', v_deadline,
      'tier', a.tier,
      'pickCount', a.pick_count,
      'hasLock', a.has_lock,
      'picks', a.picks,
      'hoursBefore', p_hours_before
    ),
    v_when, 'pending', 0, p_week, p_season
  FROM public.unsubmitted_pick_audience(p_week, p_season) a
  WHERE (NOT p_complete_only OR a.tier = 'complete')
    -- never queue the same tier twice for the same person/week
    AND NOT EXISTS (
      SELECT 1 FROM public.email_jobs j
      WHERE j.user_id = a.user_id
        AND j.template_type = 'picks_unsubmitted'
        AND j.week = p_week AND j.season = p_season
        AND (j.payload->>'hoursBefore')::numeric = p_hours_before
        AND j.status <> 'cancelled'
    );

  GET DIAGNOSTICS v_queued = ROW_COUNT;
  RETURN jsonb_build_object('queued', v_queued, 'scheduled_for', v_when);
END;
$function$;

REVOKE ALL ON FUNCTION public.queue_unsubmitted_pick_nudges(integer,integer,numeric,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_unsubmitted_pick_nudges(integer,integer,numeric,boolean,boolean) TO authenticated, service_role;
