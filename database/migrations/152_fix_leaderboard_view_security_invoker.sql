-- Migration 152: Fix blank public leaderboards (season + weekly)
--
-- PROBLEM:
--   season_leaderboard and weekly_leaderboard were set to security_invoker = true,
--   so they run with the CALLER's permissions. Both views INNER JOIN
--   leaguesafe_payments (to gate the board to paid users), but RLS on
--   leaguesafe_payments blocks the anon/authenticated roles. Result: the JOIN
--   returns zero rows for everyone using the app (anon AND logged-in admins),
--   so the leaderboard renders blank -- even though the data is healthy
--   (608 paid+matched payments for 2025, 36k+ picks).
--
--   Proof: season_leaderboard returns 584 rows for service_role but 0 for anon.
--   best_finish_leaderboard (a normal security-definer view) returns 452 for
--   BOTH roles, which is why only it still displayed.
--
-- FIX:
--   Run these two views as the view owner (security_invoker = false), exactly
--   like best_finish_leaderboard. The owner can read leaguesafe_payments
--   internally to apply the paid-user gate, while the views still expose only
--   safe aggregate columns (display_name, W/L/points, payment_status label).
--   leaguesafe_payments itself stays fully locked down by RLS.
--
-- SAFETY:
--   - No data is modified.
--   - No new columns are exposed (view definitions are unchanged).
--   - Payment-gating behavior is preserved: only status = 'Paid' users appear.
--   - Fully reversible: SET (security_invoker = true) restores prior state.
--   - Supabase Security Advisor will list these as "Security Definer View"
--     (informational) -- this is intended and matches best_finish_leaderboard.

ALTER VIEW public.season_leaderboard SET (security_invoker = false);
ALTER VIEW public.weekly_leaderboard SET (security_invoker = false);

-- Verify (run manually after applying):
--   SET ROLE anon;
--   SELECT count(*) FROM season_leaderboard WHERE season = 2025;  -- expect > 0
--   SELECT count(*) FROM weekly_leaderboard WHERE season = 2025 AND week = 14;
--   RESET ROLE;
