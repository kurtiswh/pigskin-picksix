-- Migration 215: give player writes the same identity fallback admins have
--
-- 480 signed-in players carry two ids. Their public.users profile row was
-- created before their auth account (LeagueSafe import and similar), so
-- profile id != auth.users id, with the email as the only link. useAuth
-- resolves the profile BY EMAIL, so the app writes picks with the profile id
-- while the JWT carries the auth id.
--
-- Migration 182 gave ADMIN checks an email fallback for exactly this
-- (is_current_user_admin: id = auth.uid() OR email matches the JWT). Player
-- policies never got it, so once migration 161 scoped picks to
-- auth.uid() = user_id, every one of those 480 players hit
--   42501 new row violates row-level security policy for table "picks"
-- on their FIRST pick -- with picks open. Admins never saw it, their fallback
-- absorbed it. 2025 predates 161, which is why last season was clean.
--
-- Same root broke pick confirmations: queue_pick_confirmation looked its
-- caller up as WHERE id = auth.uid(), found no profile row for a mismatched
-- player, and raised 'No account found' -- deterministically, retries be
-- damned. (pg_stat_statements never showed these calls; it only records
-- statements that complete.)
--
-- Trust note: the email fallback trusts auth.jwt()->>'email', which Supabase
-- sets from the verified account email -- the same trust the admin check has
-- relied on since 182.

-- ── who is the signed-in player? ───────────────────────────────────────────
-- Prefer the id match when both hold; NULL when signed out or no profile.
CREATE OR REPLACE FUNCTION public.current_player_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id
  FROM public.users u
  WHERE u.id = auth.uid()
     OR (auth.uid() IS NOT NULL
         AND lower(u.email) = lower(COALESCE(auth.jwt() ->> 'email', '')))
  ORDER BY (u.id = auth.uid()) DESC
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_current_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_user_id IS NOT NULL AND p_user_id = public.current_player_id();
$function$;

REVOKE ALL ON FUNCTION public.current_player_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_player_id() TO authenticated, anon, service_role;
REVOKE ALL ON FUNCTION public.is_current_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_current_user(uuid) TO authenticated, anon, service_role;

-- The fallback path scans users by email; give it an index.
CREATE INDEX IF NOT EXISTS idx_users_lower_email ON public.users (lower(email));

-- ── picks policies: same shape as 161/161b, identity check widened ─────────
DROP POLICY IF EXISTS "Users can insert own picks before game lock" ON public.picks;
CREATE POLICY "Users can insert own picks before game lock" ON public.picks
  FOR INSERT
  WITH CHECK (
    public.is_current_user(user_id)
    AND public.game_is_open_for_picks(game_id)
  );

DROP POLICY IF EXISTS "Users can update own picks before game lock" ON public.picks;
CREATE POLICY "Users can update own picks before game lock" ON public.picks
  FOR UPDATE
  USING (
    public.is_current_user(user_id)
    AND public.game_is_open_for_picks(game_id)
  );

DROP POLICY IF EXISTS "Users can delete own picks before game lock" ON public.picks;
CREATE POLICY "Users can delete own picks before game lock" ON public.picks
  FOR DELETE
  USING (
    public.is_current_user(user_id)
    AND public.game_is_open_for_picks(game_id)
  );

-- ── queue_pick_confirmation: resolve the PROFILE, not the auth id ──────────
CREATE OR REPLACE FUNCTION public.queue_pick_confirmation(p_week integer, p_season integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_email text;
  v_name text;
  v_submitted timestamptz;
  v_picks jsonb;
  v_job_id uuid;
  v_token uuid := gen_random_uuid();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in';
  END IF;

  v_uid := public.current_player_id();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No account found';
  END IF;

  SELECT lower(u.email), COALESCE(u.display_name, split_part(u.email, '@', 1))
  INTO v_email, v_name
  FROM public.users u
  WHERE u.id = v_uid;

  PERFORM public.assert_confirmation_rate_ok(v_email);

  SELECT jsonb_agg(pick ORDER BY sort_key), max(submitted_at)
  INTO v_picks, v_submitted
  FROM (
    SELECT
      jsonb_build_object(
        'game', g.away_team || ' @ ' || g.home_team,
        'pick', pk.selected_team,
        'spread', COALESCE(g.spread, 0),
        'isLock', COALESCE(pk.is_lock, false),
        'lockTime', g.kickoff_time
      ) AS pick,
      g.kickoff_time AS sort_key,
      pk.submitted_at
    FROM public.picks pk
    JOIN public.games g ON g.id = pk.game_id
    WHERE pk.user_id = v_uid
      AND pk.week = p_week
      AND pk.season = p_season
      AND pk.submitted = true
  ) s;

  IF v_picks IS NULL THEN
    RAISE EXCEPTION 'No submitted picks found for week % of %', p_week, p_season;
  END IF;

  INSERT INTO public.email_jobs (
    user_id, email, template_type, subject, html_content, text_content,
    payload, send_token, scheduled_for, status, attempts, week, season
  )
  VALUES (
    v_uid, v_email, 'picks_submitted',
    format('✅ Week %s Picks Confirmed - %s Games Selected', p_week, jsonb_array_length(v_picks)),
    NULL, NULL,
    jsonb_build_object(
      'userDisplayName', v_name,
      'week', p_week,
      'season', p_season,
      'submittedAt', COALESCE(v_submitted, now()),
      'picks', v_picks
    ),
    v_token, now(), 'pending', 0, p_week, p_season
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object('job_id', v_job_id, 'send_token', v_token);
END;
$function$;
