-- Migration 210: give the admin pick-confirmation test its own path
--
-- REPORTED FROM USE. "Send test pick confirmation" reports success and no email
-- arrives.
--
-- My regression from 201. The button used to build six mock picks in the
-- browser and mail them to whatever address was typed in. 201 pointed
-- NotificationScheduler.onPicksSubmitted at queue_pick_confirmation, which
-- deliberately takes no email and no pick list — it derives both from the
-- signed-in account, which is exactly what makes it safe for real submissions
-- and exactly what makes it useless as a test:
--
--   * the address in the box is ignored; it would go to the admin's own account
--   * the mock picks are ignored; it reads the caller's real submitted picks
--   * admins have no submitted picks for an unopened week, so the RPC raises
--     'No submitted picks found' and nothing is queued
--
-- Worse, the failure was invisible. onPicksSubmitted catches the error and logs
-- it, so the handler carried on and set "✅ Test pick confirmation sent". And
-- because onPicksSubmitted begins by cancelling that user's pending reminders,
-- pressing Test quietly cancelled the admin's own real scheduled emails.
--
-- A test needs a shape to render, not a real submission — the same conclusion as
-- 209 for the recap. This builds a sample card from the week's actual games and
-- sends it wherever the admin asks, without touching anyone's queue.

CREATE OR REPLACE FUNCTION public.queue_pick_confirmation_test(
  p_to_email text,
  p_week integer,
  p_season integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_picks jsonb;
  v_job_id uuid;
  v_token uuid := gen_random_uuid();
BEGIN
  PERFORM public.assert_admin_or_server();

  IF p_to_email IS NULL OR btrim(p_to_email) = '' THEN
    RAISE EXCEPTION 'A test address is required';
  END IF;

  SELECT COALESCE(NULLIF(btrim(u.display_name), ''), 'there') INTO v_name
  FROM public.users u WHERE u.id = auth.uid();

  -- Real matchups make the preview worth looking at. In preseason this week's
  -- board is usually empty, so fall back to the most recent season that played
  -- it — same approach as the recap test in 209.
  SELECT jsonb_agg(
           jsonb_build_object(
             'game', g.away_team || ' @ ' || g.home_team,
             'pick', g.home_team,
             'spread', g.spread,
             'isLock', g.rn = 1,
             'lockTime', g.kickoff_time
           ) ORDER BY g.rn)
  INTO v_picks
  FROM (
    SELECT home_team, away_team, spread, kickoff_time,
           row_number() OVER (ORDER BY kickoff_time) AS rn
    FROM public.games
    WHERE week = p_week
      AND season = COALESCE(
        (SELECT gg.season FROM public.games gg
         WHERE gg.week = p_week AND gg.season <= p_season
         ORDER BY gg.season DESC LIMIT 1),
        p_season)
    LIMIT 6
  ) g;

  IF v_picks IS NULL THEN
    RAISE EXCEPTION 'No games found for week % to build a sample from', p_week;
  END IF;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, send_token, scheduled_for, status, attempts
  )
  VALUES (
    NULL,
    btrim(p_to_email),
    'picks_submitted',
    format('[TEST] ✅ Week %s Picks Confirmed - %s Games Selected',
           p_week, jsonb_array_length(v_picks)),
    NULL, NULL,
    jsonb_build_object(
      'userDisplayName', COALESCE(v_name, 'there'),
      'week', p_week,
      'season', p_season,
      'submittedAt', now(),
      'picks', v_picks,
      'isTest', true,
      'isSample', true
    ),
    v_token, now(), 'pending', 0
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id, 'send_token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION public.queue_pick_confirmation_test(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.queue_pick_confirmation_test(text, integer, integer) TO authenticated, service_role;

COMMENT ON FUNCTION public.queue_pick_confirmation_test(text, integer, integer) IS
  'Admin preview of the pick-confirmation email. Renders a sample card from the '
  'week''s real games to any address, without reading or touching anyone''s picks '
  'or scheduled emails.';
