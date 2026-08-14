-- Migration 208: the last four emails stop being rendered in a browser
--
-- 201 did pick confirmations, 203 did the recap and the preseason test. What was
-- left were the batches an admin triggers when a week opens or closes:
--
--   week_opened      "Week N is open" to every paid player
--   pick_reminder    one per player per configured reminder hour
--   deadline_alert   the 24h / 2h urgency variants
--   weekly_results   each player's own results for the week
--
-- All four were built in the admin's browser and INSERTed as finished HTML, one
-- row per user in a loop. With this migration they carry a payload instead, so
-- send-email renders them from the same TypeScript templates the app uses and
-- no email body is written by a client anywhere in the system.
--
-- ── Not just a security change ─────────────────────────────────────────────
--
-- The loops were also slow and fragile: onWeekOpened did one INSERT per user
-- per reminder time from the browser (600+ players x N reminders), and any
-- failure part-way left a half-scheduled week with no record of where it
-- stopped. Each of these is now a single statement.
--
-- Two real bugs fall out of moving the queries server-side:
--
--   * weekly_results reported season points and season rank that were actually
--     the WEEKLY figures. EmailTemplates.weeklyResults mapped seasonPoints
--     from userStats.points with a comment saying "this would come from a
--     different source in real usage". It now comes from season_leaderboard.
--   * getUserWeekStats counted every submitted pick, including disqualified
--     ones. The payload below excludes them, matching the leaderboard.

-- ── 1. Who gets a given notification ───────────────────────────────────────
--
-- Mirrors EmailService.getUsersForNotification: opted in globally and for this
-- specific type, and paid for the season. The client did this with a JOIN plus
-- a batched follow-up query to avoid URL length limits — a constraint that only
-- exists because it was running over PostgREST in the first place.

CREATE OR REPLACE FUNCTION public.notification_audience(
  p_pref text,
  p_season integer
)
RETURNS TABLE (user_id uuid, email text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (lower(u.email))
         u.id, u.email, COALESCE(NULLIF(btrim(u.display_name), ''), 'there')
  FROM public.users u
  JOIN public.leaguesafe_payments lp
    ON lp.user_id = u.id AND lp.season = p_season AND lp.status = 'Paid'
  WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
    AND COALESCE((u.preferences->>'email_notifications')::boolean, true) = true
    AND COALESCE((u.preferences->>p_pref)::boolean, true) = true
  ORDER BY lower(u.email), u.created_at;
$$;

REVOKE ALL ON FUNCTION public.notification_audience(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notification_audience(text, integer) TO authenticated, service_role;

-- ── 2. Week opened ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.queue_week_opened_announcement(
  p_week integer,
  p_season integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deadline timestamptz;
  v_games integer;
  v_queued integer := 0;
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT deadline INTO v_deadline
  FROM public.week_settings WHERE season = p_season AND week = p_week;
  IF v_deadline IS NULL THEN
    RAISE EXCEPTION 'Week % of % has no deadline set', p_week, p_season;
  END IF;

  SELECT count(*) INTO v_games FROM public.games
  WHERE season = p_season AND week = p_week;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, scheduled_for, status, attempts
  )
  SELECT a.user_id, a.email, 'week_opened',
         format('🏈 Week %s Picks Are Open!', p_week),
         NULL, NULL,
         jsonb_build_object(
           'week', p_week, 'season', p_season,
           'deadline', v_deadline, 'totalGames', v_games
         ),
         now(), 'pending', 0
  FROM public.notification_audience('open_picks_notifications', p_season) a;

  GET DIAGNOSTICS v_queued = ROW_COUNT;
  RETURN jsonb_build_object('queued', v_queued);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_week_opened_announcement(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_week_opened_announcement(integer, integer) TO authenticated, service_role;

-- ── 3. Pick reminders and deadline alerts ──────────────────────────────────
--
-- One call replaces the browser's nested loop over users x reminder hours.
-- p_alert_hours get the urgent deadline_alert template; p_reminder_hours get
-- the gentler pick_reminder one. Anyone who has already submitted is skipped,
-- and so is any send time that has already passed.

CREATE OR REPLACE FUNCTION public.queue_pick_reminders(
  p_week integer,
  p_season integer,
  p_reminder_hours integer[] DEFAULT '{}',
  p_alert_hours integer[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deadline timestamptz;
  v_queued integer := 0;
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT deadline INTO v_deadline
  FROM public.week_settings WHERE season = p_season AND week = p_week;
  IF v_deadline IS NULL THEN
    RAISE EXCEPTION 'Week % of % has no deadline set', p_week, p_season;
  END IF;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, scheduled_for, status, attempts
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
         'pending', 0
  FROM public.notification_audience('pick_reminders', p_season) a
  CROSS JOIN (
    SELECT unnest(p_reminder_hours) AS hours, 'pick_reminder' AS kind
    UNION ALL
    SELECT unnest(p_alert_hours), 'deadline_alert'
  ) h
  WHERE v_deadline - make_interval(hours => h.hours) > now()
    -- Already submitted? Nothing to remind them about.
    AND NOT EXISTS (
      SELECT 1 FROM public.picks pk
      WHERE pk.user_id = a.user_id AND pk.week = p_week
        AND pk.season = p_season AND pk.submitted = true
    );

  GET DIAGNOSTICS v_queued = ROW_COUNT;
  RETURN jsonb_build_object('queued', v_queued);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_pick_reminders(integer, integer, integer[], integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_pick_reminders(integer, integer, integer[], integer[]) TO authenticated, service_role;

-- ── 4. Weekly results ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.queue_weekly_results(
  p_week integer,
  p_season integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_players integer;
  v_queued integer := 0;
BEGIN
  PERFORM public.assert_admin_or_server();

  SELECT count(*) INTO v_total_players
  FROM public.weekly_leaderboard WHERE season = p_season AND week = p_week;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, scheduled_for, status, attempts
  )
  SELECT a.user_id, a.email, 'weekly_results',
         format('📊 Week %s Results - %s points', p_week, COALESCE(wl.total_points, 0)),
         NULL, NULL,
         jsonb_build_object(
           'userDisplayName', a.display_name,
           'week', p_week, 'season', p_season,
           'userStats', jsonb_build_object(
             'weeklyPoints', COALESCE(wl.total_points, 0),
             'weeklyRank', COALESCE(wl.weekly_rank, 0),
             'totalPlayers', v_total_players,
             -- Season figures from the season leaderboard. The client used to
             -- send the weekly numbers here and label them "season".
             'seasonPoints', COALESCE(sl.total_points, 0),
             'seasonRank', COALESCE(sl.season_rank, 0),
             'picks', COALESCE(pk.picks, '[]'::jsonb)
           )
         ),
         now(), 'pending', 0
  FROM public.notification_audience('weekly_results', p_season) a
  LEFT JOIN public.weekly_leaderboard wl
    ON wl.user_id = a.user_id AND wl.season = p_season AND wl.week = p_week
  LEFT JOIN public.season_leaderboard sl
    ON sl.user_id = a.user_id AND sl.season = p_season
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'game', g.away_team || ' @ ' || g.home_team,
               'pick', p.selected_team,
               'result', p.result,
               'points', COALESCE(p.points_earned, 0),
               'isLock', COALESCE(p.is_lock, false)
             ) ORDER BY g.kickoff_time
           ) AS picks
    FROM public.picks p
    JOIN public.games g ON g.id = p.game_id
    WHERE p.user_id = a.user_id AND p.week = p_week AND p.season = p_season
      AND p.submitted = true
      AND COALESCE(p.disqualified, false) = false
  ) pk ON true
  -- No picks that week means no results worth mailing.
  WHERE pk.picks IS NOT NULL;

  GET DIAGNOSTICS v_queued = ROW_COUNT;
  RETURN jsonb_build_object('queued', v_queued);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_weekly_results(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_weekly_results(integer, integer) TO authenticated, service_role;
