-- Migration 172: cleanup batch
--   1. Per-game lock enforcement for anonymous pick submissions (B4a parity).
--   2. update-game-statistics cron: run more often across the game week.
--   3. Delete a stray 2024 test anonymous pick.

-- 1. anonymous_picks had FOUR redundant wide-open INSERT policies (all
-- WITH CHECK true) — anon could submit anytime, no lock. Replace with ONE
-- lock-gated policy: anon may insert a pick only while that game is open
-- (picks_open AND now < custom_lock_time/deadline). Admin/authenticated ALL
-- policies remain, so they still bypass for corrections.
DROP POLICY IF EXISTS "anon_can_insert_picks" ON public.anonymous_picks;
DROP POLICY IF EXISTS "Allow anonymous pick creation" ON public.anonymous_picks;
DROP POLICY IF EXISTS "Allow insert for anonymous users" ON public.anonymous_picks;
DROP POLICY IF EXISTS "Allow anonymous insert for pick submission" ON public.anonymous_picks;

DROP POLICY IF EXISTS "Anon can submit picks before game lock" ON public.anonymous_picks;
CREATE POLICY "Anon can submit picks before game lock" ON public.anonymous_picks
  FOR INSERT TO public
  WITH CHECK (public.game_is_open_for_picks(game_id));

-- 2. Refresh game pick-count stats every 30 min across the week (was once, Sat 16:00 UTC).
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'update-game-statistics'),
  schedule := '*/30 * * * 4,5,6,0'
);

-- 3. Remove the stray 2024 test anonymous pick (Test User / test-assignment@example.com).
DELETE FROM public.anonymous_picks WHERE id = 'eba8aa28-ccf9-4e44-b1df-72465809739e';
