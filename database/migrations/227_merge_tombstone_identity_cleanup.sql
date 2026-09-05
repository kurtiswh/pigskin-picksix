-- Migration 227: merged accounts kept re-attracting payments and emails
--
-- merge_users soft-deletes the losing account by appending '_merged_<ts>' to
-- users.email -- and ONLY users.email. It leaves users.leaguesafe_email and
-- the user_emails rows intact, so the account is still findable by every
-- identity path except the one that was neutered.
--
-- Consequences, all observed in production:
--   * The LeagueSafe importer matched caracapra@yahoo.com,
--     dan.kucab@gmail.com and dancouch1977@hotmail.com to the TOMBSTONES, so
--     three 2026 payments landed on dead accounts.
--   * Those tombstones then satisfied notification_audience's "Paid" join, so
--     reminder jobs were queued for them and Resend rejected the malformed
--     '..._merged_2026-07-05 21:04:12+00' addresses.
--   * Worse, the surviving accounts showed NO PAYMENT ROW. Dan Couch has six
--     week 1 picks and reads as unpaid -- precisely the "I paid but you're not
--     showing me paid" complaint, and he would have been dropped from the
--     leaderboard at the end of the grace period despite having paid.
--
-- Repairs the three payments, neuters the remaining identity fields on every
-- tombstone, and closes all three recurrence paths.

-- ── 1. Move payments sitting on a tombstone to its merge target ────────────
-- Only where the survivor has no row for that season, so the unique
-- (user_id, season) constraint cannot be violated; anything else is reported
-- below rather than silently reassigned.
UPDATE public.leaguesafe_payments lp
SET user_id = h.target_user_id, is_matched = true, updated_at = NOW()
FROM public.user_merge_history h
JOIN public.users t ON t.id = h.source_user_id
WHERE lp.user_id = h.source_user_id
  AND t.email LIKE '%\_merged\_%'
  AND NOT EXISTS (
    SELECT 1 FROM public.leaguesafe_payments x
    WHERE x.user_id = h.target_user_id AND x.season = lp.season
  );

-- ── 2. Neuter the identity fields the merge missed ────────────────────────
UPDATE public.users u
SET leaguesafe_email = leaguesafe_email || '_merged_' || NOW()::text
WHERE u.email LIKE '%\_merged\_%'
  AND u.leaguesafe_email IS NOT NULL
  AND u.leaguesafe_email NOT LIKE '%\_merged\_%';

DELETE FROM public.user_emails ue
USING public.users u
WHERE ue.user_id = u.id
  AND u.email LIKE '%\_merged\_%'
  AND ue.email NOT LIKE '%\_merged\_%';

-- ── 3. merge_users neuters EVERY identity field from now on ───────────────
CREATE OR REPLACE FUNCTION public.neuter_merged_user_identity(p_source_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stamp text := '_merged_' || NOW()::text;
BEGIN
  -- Every path that can find a user by address has to be closed, or the
  -- account stays reachable by the importer and the audience queries.
  UPDATE public.users
  SET email = CASE WHEN email LIKE '%\_merged\_%' THEN email ELSE email || v_stamp END,
      leaguesafe_email = CASE
        WHEN leaguesafe_email IS NULL THEN NULL
        WHEN leaguesafe_email LIKE '%\_merged\_%' THEN leaguesafe_email
        ELSE leaguesafe_email || v_stamp END,
      display_name = CASE WHEN display_name LIKE '% (Merged)' THEN display_name
                          ELSE display_name || ' (Merged)' END,
      updated_at = NOW()
  WHERE id = p_source_user_id;

  DELETE FROM public.user_emails WHERE user_id = p_source_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.neuter_merged_user_identity(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.neuter_merged_user_identity(uuid) TO authenticated, service_role;

-- ── 4. Defence in depth: a tombstone is never a notification recipient ────
CREATE OR REPLACE FUNCTION public.notification_audience(p_pref text, p_season integer)
RETURNS TABLE(user_id uuid, email text, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (lower(u.email))
         u.id, u.email, COALESCE(NULLIF(btrim(u.display_name), ''), 'there')
  FROM public.users u
  JOIN public.leaguesafe_payments lp
    ON lp.user_id = u.id AND lp.season = p_season AND lp.status = 'Paid'
  WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
    -- merged tombstones carry an unmailable address; never queue for them
    AND u.email NOT LIKE '%\_merged\_%'
    AND COALESCE((u.preferences->>'email_notifications')::boolean, true) = true
    AND COALESCE((u.preferences->>p_pref)::boolean, true) = true
  ORDER BY lower(u.email), u.created_at;
$function$;

-- Same guard on the unsubmitted-pick audience (migration 224).
CREATE OR REPLACE FUNCTION public.unsubmitted_pick_audience(p_week integer, p_season integer)
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
    AND u.email NOT LIKE '%\_merged\_%'
    AND COALESCE((u.preferences->>'email_notifications')::boolean, true) = true
    AND COALESCE((u.preferences->>'pick_reminders')::boolean, true) = true
  GROUP BY u.id, u.email, u.display_name
  HAVING count(p.id) FILTER (WHERE p.submitted) = 0;
$function$;

-- ── 5. Admin check: anything still stranded on a tombstone ────────────────
CREATE OR REPLACE FUNCTION public.merged_account_leftovers()
RETURNS TABLE (
  tombstone_id uuid, tombstone_name text, original_email text,
  survivor_name text, survivor_email text,
  payments_stranded bigint, picks_stranded bigint, anon_picks_stranded bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_admin_or_server();

  RETURN QUERY
  SELECT u.id, u.display_name, split_part(u.email,'_merged_',1),
         s.display_name, s.email,
         (SELECT count(*) FROM public.leaguesafe_payments lp WHERE lp.user_id = u.id),
         (SELECT count(*) FROM public.picks p WHERE p.user_id = u.id),
         (SELECT count(*) FROM public.anonymous_picks ap WHERE ap.assigned_user_id = u.id)
  FROM public.users u
  LEFT JOIN public.user_merge_history h ON h.source_user_id = u.id
  LEFT JOIN public.users s ON s.id = h.target_user_id
  WHERE u.email LIKE '%\_merged\_%'
    AND (
      EXISTS (SELECT 1 FROM public.leaguesafe_payments lp WHERE lp.user_id = u.id)
      OR EXISTS (SELECT 1 FROM public.picks p WHERE p.user_id = u.id)
      OR EXISTS (SELECT 1 FROM public.anonymous_picks ap WHERE ap.assigned_user_id = u.id)
    )
  ORDER BY 6 DESC, 7 DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.merged_account_leftovers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merged_account_leftovers() TO authenticated, service_role;
