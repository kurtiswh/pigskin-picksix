-- 254: RLS hardening, phase 1 + public views for phase 2
--
-- Context (audit 2026-11-01): the public anon key can read every column of users,
-- picks, anonymous_picks and user_merge_history, and can call a few SECURITY DEFINER
-- helpers that return private data. This migration does the parts that cannot break
-- anything on its own; migration 255 closes the open SELECT policies once the client
-- no longer depends on them.
--
-- Phase 1 (lockdown, no client callers):
--   * debug_duplicate_picks, debug_user_auth_status: leftover debug helpers, no callers.
--   * validate_user_profile_for_picks(user_id): returned any user's email to anyone who
--     knew their id (ids are public on the leaderboard). Only dead code calls it.
--   * user_merge_history: old emails/names, readable by anyone. Only the admin merge UI
--     reads it.
--
-- Phase 2 (additive views the client switches to before 255 lands):
--   * public_user_profiles: id + display_name only, for showing names on public pages.
--   * public_anonymous_picks: anonymous picks assigned to a player, without email, name
--     or admin columns, and only for games that have locked. Feeds the leaderboard's
--     per-player pick breakdowns.
-- Both views run with owner rights (security_invoker = false) so they keep working after
-- 255 restricts the base tables. They expose a strict subset of what is public today.

-- Phase 1 ------------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.debug_duplicate_picks(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.debug_user_auth_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_user_profile_for_picks(uuid) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Anyone can view merge history" ON public.user_merge_history;
CREATE POLICY "Admins can view merge history" ON public.user_merge_history
  FOR SELECT TO authenticated
  USING (public.is_current_user_admin());

-- Phase 2 views ------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_user_profiles
WITH (security_invoker = false) AS
  SELECT u.id, u.display_name
  FROM public.users u;

COMMENT ON VIEW public.public_user_profiles IS
  'Public display names. Use this, not users, for showing names on public pages (migration 254).';

CREATE OR REPLACE VIEW public.public_anonymous_picks
WITH (security_invoker = false) AS
  SELECT
    ap.id,
    ap.assigned_user_id,
    ap.season,
    ap.week,
    ap.game_id,
    ap.home_team,
    ap.away_team,
    ap.selected_team,
    ap.is_lock,
    ap.result,
    ap.points_earned,
    ap.show_on_leaderboard,
    ap.disqualified,
    ap.is_active_pick_set,
    ap.submitted_at
  FROM public.anonymous_picks ap
  WHERE ap.assigned_user_id IS NOT NULL
    AND NOT public.game_is_open_for_picks(ap.game_id);

COMMENT ON VIEW public.public_anonymous_picks IS
  'Assigned anonymous picks for locked games, no PII. Public pages read this, not anonymous_picks (migration 254).';

REVOKE ALL ON public.public_user_profiles, public.public_anonymous_picks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_user_profiles, public.public_anonymous_picks TO anon, authenticated;
