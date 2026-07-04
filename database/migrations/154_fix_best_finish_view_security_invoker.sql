-- Migration 154: Fix empty Best Finish tab for the public
--
-- Same root cause as migration 152 (season/weekly views), on the third view.
--
-- best_finish_leaderboard is security_invoker = true and computes
--   payment_status = COALESCE(lsp.status, 'not_paid')
-- via a LEFT JOIN to leaguesafe_payments. Under security_invoker the join runs
-- with the caller's privileges, so RLS blocks anon/authenticated from reading
-- leaguesafe_payments -> lsp.status is NULL -> every player is labeled
-- 'not_paid'. The BestFinishLeaderboard component then filters non-admins to
-- paid players only, so the public sees an empty tab (admins, who bypass the
-- filter, still see everyone).
--
-- Proof: as service_role all 452 rows read 'Paid'; as anon all read 'not_paid'.
--
-- FIX: run the view as its owner (security_invoker = false) like the other
-- leaderboard views, so it can read leaguesafe_payments internally and label
-- paid players correctly. Only aggregate/label columns are exposed.
--
-- (The matching component-side case fix -- 'paid' vs 'Paid' -- ships in the
-- frontend change alongside this migration.)

ALTER VIEW public.best_finish_leaderboard SET (security_invoker = false);

-- Verify (run manually):
--   SET ROLE anon;
--   SELECT payment_status, count(*) FROM best_finish_leaderboard
--   WHERE season = 2025 GROUP BY payment_status;   -- expect 'Paid'
--   RESET ROLE;
