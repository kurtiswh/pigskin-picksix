-- 255: RLS hardening, phase 3: close the open SELECT policies
--
-- Before this, the public anon key (shipped in the site bundle) could read:
--   * users: every column for every account (emails, LeagueSafe emails, payment status,
--     is_admin, unsubscribe_token)
--   * picks / anonymous_picks: every pick, including before kickoff, and anonymous
--     submitters' emails and names
-- Prerequisites, all live before this runs:
--   * 254: public_user_profiles and public_anonymous_picks views for public pages
--   * client 3b5eddc: profile, pick sheet and admin fetches send the user's JWT; public
--     name lookups and pick breakdowns read the 254 views
-- Verified before writing (2026-11-01), by evaluating the policies that remain here
-- under real users' JWT claims:
--   * regular player: reads exactly their own users row, by id and by email
--   * admin: reads all 2,136 rows
--   * all 519 logins whose auth id differs from their profile id resolve to exactly one
--     profile through the email path, as useAuth does
--   * every client-called RPC touching these tables is SECURITY DEFINER
--
-- Decisions (owner, 2026-11-01):
--   * Other players' picks stay visible once the game locks (leaderboard breakdowns).
--   * Rotate every unsubscribe_token, since all were publicly readable. Links in emails
--     already delivered stop working; queued emails are unaffected because the sender
--     joins users.unsubscribe_token at send time (205_lock_down_drain_functions.sql).
--
-- Rollback: database/rollback_255_rls_phase3.sql restores the open policies. It cannot
-- restore the old unsubscribe tokens, and should not.

-- Which games are still open for picks. Owner rights so the picks policy keeps working
-- whatever RLS games/week_settings carry later; same condition as game_is_open_for_picks.
-- Returned as a set so the policy can hash it once per query: the per-row
-- game_is_open_for_picks() form took ~1s for one week's picks, this takes ~30ms.
CREATE OR REPLACE FUNCTION public.open_pick_game_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.id
  FROM public.games g
  JOIN public.week_settings ws ON ws.week = g.week AND ws.season = g.season
  WHERE ws.picks_open = true
    AND now() < COALESCE(g.custom_lock_time, ws.deadline);
$$;

REVOKE ALL ON FUNCTION public.open_pick_game_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_pick_game_ids() TO anon, authenticated;

-- users ----------------------------------------------------------------------------------
-- Left in place: "Users can manage own profile" (is_current_user(id)) and
-- "Admins can manage all users". Public pages read public_user_profiles.
DROP POLICY IF EXISTS "Public read display name" ON public.users;

-- picks ----------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read picks" ON public.picks;
DROP POLICY IF EXISTS "anonymous_read_picks" ON public.picks;

-- Your own picks any time; anyone's picks once that game has locked; admins everything.
-- The (SELECT ...) wrappers make the per-user checks run once per query, not per row.
CREATE POLICY "Read own picks, or any pick once its game locks" ON public.picks
  FOR SELECT TO anon, authenticated
  USING (
    user_id = (SELECT public.current_player_id())
    OR (SELECT public.is_current_user_admin())
    -- IS NULL keeps parity with NOT game_is_open_for_picks(game_id), which is true for a
    -- NULL game_id; NOT IN alone would hide those rows whenever any game is open.
    OR game_id IS NULL
    OR game_id NOT IN (SELECT public.open_pick_game_ids())
  );

-- anonymous_picks --------------------------------------------------------------------------
-- Left in place: "Users can manage assigned anonymous picks" (own rows), the admin
-- policies, and "Anon can submit picks before game lock" (the anonymous form posts with
-- return=minimal, so it never needs to read rows back). Public pages read
-- public_anonymous_picks, which has no email/name columns.
DROP POLICY IF EXISTS "Allow anonymous read access" ON public.anonymous_picks;
DROP POLICY IF EXISTS "Allow authenticated users to read all" ON public.anonymous_picks;

-- Unsubscribe tokens -------------------------------------------------------------------------
-- Pause the updated_at trigger so the rotation does not stamp every account as edited today.
ALTER TABLE public.users DISABLE TRIGGER update_users_updated_at;
UPDATE public.users SET unsubscribe_token = gen_random_uuid();
ALTER TABLE public.users ENABLE TRIGGER update_users_updated_at;
