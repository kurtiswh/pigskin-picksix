-- Migration 206: take the admin and scoring RPCs off the public internet
--
-- FOUND BY AUDIT after 205. 205 fixed the grant bug for the email functions;
-- this is the same bug everywhere else, and it is worse.
--
-- Supabase ships `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON
-- FUNCTIONS TO anon, authenticated, service_role`. Unless a migration explicitly
-- revokes it, every SECURITY DEFINER function in `public` is callable by an
-- unauthenticated request to /rest/v1/rpc/<name>. SECURITY DEFINER then bypasses
-- the RLS that everyone assumed was protecting the table underneath.
--
-- 99 definer functions exist in public. 86 were anon-callable. After excluding
-- read-only helpers, trigger functions, and the ones that correctly scope
-- themselves with auth.uid() / current_app_user_id() / a secret token, 27 were
-- writers reachable by anyone on the internet with no check of any kind.
--
-- Proven, not theorised. Against production:
--
--   POST /rest/v1/rpc/set_pick_disqualified   apikey: <anon>   ->  HTTP 204
--
-- That call disqualifies any pick by id. Others in the list let an anonymous
-- caller set the season's bracket winners, merge two user accounts, choose
-- which pick set counts for a player, dismiss an anonymous entry, or re-run
-- scoring for a game or a whole week.
--
-- The pattern that hid it: several of these take an `admin_user_id` or
-- `consolidated_by` parameter. That reads like authorization but is only audit
-- metadata — the caller supplies it, and nothing verifies it.
--
-- ── What this migration does ───────────────────────────────────────────────
--
-- Two groups, split by whether the app actually calls the function:
--
--   Not called by any client code (14). Internal helpers invoked by other
--   definer functions or by cron, both of which run as the owner and are
--   unaffected by grants. anon AND authenticated both lose EXECUTE.
--
--   Called by the admin UI (12). anon loses EXECUTE; authenticated keeps it so
--   the admin screens keep working.
--
-- ── What this does NOT fix ─────────────────────────────────────────────────
--
-- The 12 the admin UI calls have no guard in their bodies, so after this any
-- *signed-in* user can still call them. That is a much smaller surface than the
-- open internet — but with ~600 accounts it is not small enough, and it needs a
-- guard added to each function rather than a grant change. Next migration.

-- Note the FROM PUBLIC. Revoking from `anon` alone does nothing here: most of
-- these functions were created without revoking PUBLIC, so anon holds EXECUTE
-- by inheriting the PUBLIC grant rather than through a grant of its own. The
-- first pass at this migration revoked only `anon` and closed exactly one of
-- the 27. Both the named grant and the PUBLIC grant have to go.

-- ── 1. Internal / cron only: no client should reach these at all ───────────

REVOKE EXECUTE ON FUNCTION public.apply_manual_pick_corrections() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_manual_pick_corrections() TO service_role;
REVOKE EXECUTE ON FUNCTION public.calculate_game_statistics(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_game_statistics(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.calculate_pick_results(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_pick_results(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.calculate_pick_results_for_game_chunked(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_pick_results_for_game_chunked(uuid, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.calculate_week_game_statistics(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_week_game_statistics(integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.designate_primary_user_for_emails(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.designate_primary_user_for_emails(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fix_picks_for_incomplete_games(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fix_picks_for_incomplete_games(integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.link_email_to_user(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_email_to_user(uuid, text, boolean) TO service_role;
REVOKE EXECUTE ON FUNCTION public.manage_pick_set_precedence(uuid, integer, integer, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_pick_set_precedence(uuid, integer, integer, text, text, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.recalculate_all_ranks_with_ties() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_all_ranks_with_ties() TO service_role;
REVOKE EXECUTE ON FUNCTION public.scheduled_live_game_updates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scheduled_live_game_updates() TO service_role;
REVOKE EXECUTE ON FUNCTION public.scheduled_pick_processing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scheduled_pick_processing() TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_all_game_pick_counts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_all_game_pick_counts() TO service_role;
REVOKE EXECUTE ON FUNCTION public.update_game_pick_counts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_game_pick_counts(uuid) TO service_role;

-- ── 2. Admin UI calls these: anon only ─────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.auto_tie_anonymous_picks(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_tie_anonymous_picks(integer, integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.calculate_and_update_completed_game(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_and_update_completed_game(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.consolidate_user_under_primary(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consolidate_user_under_primary(uuid, uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_custom_pick_combination(uuid, integer, integer, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_custom_pick_combination(uuid, integer, integer, jsonb, uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.dismiss_anonymous_entry(text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_anonymous_entry(text, integer, integer, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_or_create_season_winners(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_season_winners(integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.merge_users(uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_users(uuid, uuid, uuid, text, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.process_picks_for_completed_game(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_picks_for_completed_game(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.select_user_pick_set(uuid, integer, integer, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_user_pick_set(uuid, integer, integer, text, uuid, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_pick_disqualified(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pick_disqualified(uuid, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_bracket_winners(integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_bracket_winners(integer, uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_season_leaderboard_with_source(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_season_leaderboard_with_source(uuid, integer, text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_season_leaderboard_with_source(uuid, integer, character varying) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_season_leaderboard_with_source(uuid, integer, character varying) TO authenticated, service_role;
