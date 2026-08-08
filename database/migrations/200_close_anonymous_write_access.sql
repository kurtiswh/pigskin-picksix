-- Migration 200: close blanket anonymous write access
--
-- FOUND BY SECURITY REVIEW, following on from 199. Four tables carried
-- policies whose expression is literally `true` for anon. RLS ORs permissive
-- policies together, so the loosest one decides — every properly-scoped admin
-- policy sitting beside these was decorative.
--
-- This is policy drift, not a design: each table has a correct admin policy
-- AND a `true` one layered over it, the signature of "add a permissive policy
-- to make the bug go away".
--
-- All four Supabase edge functions (live-score-updater, process-reminders,
-- send-email, update-game-stats) authenticate with SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS entirely — so none of them are affected by anything here.
-- The browser-side services that write these tables (liveUpdateService,
-- CFBDLiveUpdater) are only reachable from admin components
-- (ScheduledFunctionsManager, GameCompletionTest, LiveDashboard, WeekReview),
-- and admins keep full access throughout.

-- ── games ──────────────────────────────────────────────────────────────────
-- `live_game_updates` let anon UPDATE any scheduled or in-progress game —
-- scores and spreads, which every pick result is computed from. Live scoring
-- runs in the live-score-updater edge function on the service role, and
-- manually from admin-only UI, so nothing legitimate needs this.
DROP POLICY IF EXISTS live_game_updates ON public.games;

-- ── week_settings ──────────────────────────────────────────────────────────
-- `anon_full_week_settings` (ALL, anon, true) let anyone change deadlines or
-- open and close picks. `authenticated_full_week_settings` gave every signed-in
-- player the same. Both sat on top of two correct admin-only ALL policies.
DROP POLICY IF EXISTS anon_full_week_settings ON public.week_settings;
DROP POLICY IF EXISTS authenticated_full_week_settings ON public.week_settings;

-- ── anonymous_picks ────────────────────────────────────────────────────────
-- Three UPDATE policies, all `true`, reachable by anon. They exist for admin
-- assignment, which "Admins can manage all anonymous picks" already covers;
-- players get theirs through "Users can manage assigned anonymous picks".
--
-- Submitting is unaffected: "Anon can submit picks before game lock" is an
-- INSERT policy and stays. AnonymousPicksPage only ever inserts — it has no
-- UPDATE against this table.
DROP POLICY IF EXISTS "Allow anonymous assignment updates" ON public.anonymous_picks;
DROP POLICY IF EXISTS "Allow anonymous update for management" ON public.anonymous_picks;
DROP POLICY IF EXISTS "Allow assignment updates" ON public.anonymous_picks;

-- Four SELECT policies all saying `true`; keep one.
DROP POLICY IF EXISTS "Allow anonymous read access for management" ON public.anonymous_picks;
DROP POLICY IF EXISTS anon_can_select_picks ON public.anonymous_picks;
DROP POLICY IF EXISTS anonymous_read_anonymous_picks ON public.anonymous_picks;

-- ── email_jobs ─────────────────────────────────────────────────────────────
-- PARTIAL, deliberately. See the note at the bottom.
--
-- Removed here: blanket UPDATE and DELETE. Both were `true` for everyone, and
-- both are already covered for every legitimate caller by the scoped policies
-- left in place ("Allow email job updates", "Users can update email jobs",
-- "Allow email job deletion"), which permit the anonymous confirmation flow
-- and admins while dropping arbitrary authenticated users.
DROP POLICY IF EXISTS "Anyone can update email jobs" ON public.email_jobs;
DROP POLICY IF EXISTS "Anyone can delete email jobs" ON public.email_jobs;

-- Three byte-identical INSERT policies; keep one.
DROP POLICY IF EXISTS "Allow email job creation" ON public.email_jobs;
DROP POLICY IF EXISTS "Allow email job insertion" ON public.email_jobs;

-- NOT CLOSED HERE, and it needs application work rather than a policy:
--
--   "Anyone can insert email jobs" (INSERT, true) combined with the table's
--   client-supplied `subject` / `html_content` columns is a send-arbitrary-
--   mail-as-pigskinpicksix primitive for an unauthenticated caller. It cannot
--   simply be dropped: AnonymousPicksPage queues its own confirmation this way
--   and has no session to scope a policy against.
--
--   "Anyone can view email jobs" (SELECT, true) exposes every queued email —
--   address, subject, body — to anon. It is also what makes the anonymous
--   page's insert-and-return work, so tightening it blindly breaks that flow.
--
--   Closing both means moving the anonymous confirmation server-side: a
--   SECURITY DEFINER RPC (or the existing send-email edge function) that takes
--   the pick set and renders the email itself, so no client ever supplies a
--   body. Then anon loses INSERT and SELECT here entirely.
