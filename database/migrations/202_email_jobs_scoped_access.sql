-- Migration 202: email_jobs stops being world-writable
--
-- Ordering note: this depends on 201's frontend change being deployed first.
-- Before it, the live AnonymousPicksPage INSERTs and UPDATEs email_jobs as
-- anon, which this takes away. Applied 2026-08-13, after that deploy.
--
-- ── What the audit found ───────────────────────────────────────────────────
--
-- 27 call sites touch email_jobs. Seven are in Edge Functions (send-email,
-- process-reminders) which authenticate with the service role and bypass RLS
-- entirely; so do the plpgsql cron senders (send_pending_preseason and
-- friends). None of those are affected by anything below.
--
-- Of the twenty browser-side sites, after migration 201:
--
--   anon           NONE. AnonymousPicksPage was the only anonymous writer and
--                  now goes through queue_anonymous_pick_confirmation, a
--                  SECURITY DEFINER RPC that bypasses RLS. EmailService's
--                  sendMagicLink and sendPasswordResetViaResend also insert as
--                  anon, but both are dead code — MagicLoginPage only calls
--                  verifyMagicLink, and password resets go through
--                  supabase.auth.resetPasswordForEmail in UserManagement.
--   authenticated  UPDATE of their own rows only, via cancelScheduledEmails
--                  (NotificationScheduler.onPicksSubmitted, from PickSheetPage).
--   admin          Everything else: onWeekOpened and onWeekCompleted queue the
--                  reminder/results/announcement batches (WeekControls,
--                  AdminNotifications), processPendingEmails drains the queue,
--                  AdminNotifications reads the status counts, and
--                  utils/emailTesting is a dev console tool.
--
-- So no legitimate anon access to this table remains.
--
-- ── What migration 200 missed ──────────────────────────────────────────────
--
-- 200 left "Allow email job updates" and "Allow email job deletion" in place,
-- describing them as already scoped to "the anonymous confirmation flow and
-- admins". They are not scoped at all. Both lead with `auth.uid() IS NULL`,
-- which is not a narrow carve-out for one flow — it is precisely the predicate
-- that is true for every anonymous request. Live definitions:
--
--   Allow email job updates    UPDATE  (auth.uid() IS NULL OR auth.uid() = user_id OR is_current_user_admin())
--   Allow email job deletion   DELETE  (auth.uid() IS NULL OR is_current_user_admin())
--
-- Anon can therefore UPDATE and DELETE any row in the queue today — rewrite a
-- pending email's recipient, or delete the whole queue. That is a bigger hole
-- than the INSERT policy 200 flagged and deferred, and it was introduced by the
-- fix rather than left behind by it.
--
-- "Users can update email jobs" has the same shape one step down: its
-- `user_id IS NULL` arm lets any signed-in player update every anonymous job.
--
-- ── The rule ───────────────────────────────────────────────────────────────
--
-- Your own rows, or you are an admin. The service role bypasses RLS and needs
-- no policy. anon needs no access at all.

-- ── 1. Remove the blanket policies ─────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can insert email jobs" ON public.email_jobs;
DROP POLICY IF EXISTS "Anyone can view email jobs" ON public.email_jobs;
DROP POLICY IF EXISTS "Allow email job updates" ON public.email_jobs;
DROP POLICY IF EXISTS "Users can update email jobs" ON public.email_jobs;
DROP POLICY IF EXISTS "Allow email job deletion" ON public.email_jobs;

-- ── 2. Scoped replacements ─────────────────────────────────────────────────

-- Reading a job means reading a recipient's address, subject and body. Players
-- may see their own; admins run the queue dashboard.
CREATE POLICY "View own email jobs" ON public.email_jobs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_current_user_admin());

-- Only admin tooling queues mail from the browser: the week-opened, reminder,
-- deadline and results batches. Player-triggered mail is queued by the
-- SECURITY DEFINER queue_* RPCs, which bypass RLS and so need no grant here.
CREATE POLICY "Admins can insert email jobs" ON public.email_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_current_user_admin());

-- cancelScheduledEmails cancels a player's own pending reminders when they
-- submit picks; admins manage the whole queue.
CREATE POLICY "Update own email jobs" ON public.email_jobs
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_current_user_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_current_user_admin());

CREATE POLICY "Admins can delete email jobs" ON public.email_jobs
  FOR DELETE TO authenticated
  USING (public.is_current_user_admin());

-- ── 3. Take the table privileges back off anon ─────────────────────────────
--
-- Migration 044 ran `GRANT ALL ON email_jobs TO anon`. RLS with no anon policy
-- already denies everything, but leaving the grant means the next permissive
-- policy anyone adds silently re-opens the table to the public internet.
REVOKE ALL ON public.email_jobs FROM anon;

COMMENT ON TABLE public.email_jobs IS
  'Email queue. Browser access is scoped to your own rows, or admin. anon has '
  'none: anonymous confirmations are queued by queue_anonymous_pick_confirmation '
  'and sent by the send-email Edge Function, both of which run server-side.';
