-- Migration 182: sweep ALL inline admin RLS checks to is_current_user_admin()
--
-- PROBLEM:
--   28 live policies across 13 tables still used the inline
--   "EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin)" pattern.
--   For admin accounts whose auth.users.id != public.users.id (account-merge
--   leftovers, see migration 168) that check is always false, so admin reads
--   return nothing and admin writes silently no-op (0 rows) or 403. Latest
--   casualty: the Reminder Schedule / admin_email_settings screen — reads fell
--   back to defaults and saves never landed. Same class as migrations 168
--   (blog_posts) and 181 (app_settings).
--
-- FIX:
--   Recreate each policy with public.is_current_user_admin() (id OR verified
--   JWT email match, SECURITY DEFINER). Extra conditions are preserved:
--   email_jobs keeps its auth.uid() IS NULL (service/legacy path) and own-row
--   terms. The redundant duplicate policy set on admin_email_settings (two
--   generations doing the same thing) is consolidated into one.
--
-- Enumerated from prod pg_policy on 2026-08-02 — this list is the live set,
-- not what the old migration files claim.

-- ── games ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin games write access" ON public.games;
CREATE POLICY "Admin games write access" ON public.games
  FOR ALL TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_delete_games" ON public.games;
CREATE POLICY "admin_delete_games" ON public.games
  FOR DELETE TO authenticated USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_insert_games" ON public.games;
CREATE POLICY "admin_insert_games" ON public.games
  FOR INSERT TO authenticated WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "admin_update_games" ON public.games;
CREATE POLICY "admin_update_games" ON public.games
  FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

-- ── picks ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage all picks" ON public.picks;
CREATE POLICY "Admins can manage all picks" ON public.picks
  FOR ALL TO authenticated USING (public.is_current_user_admin());

-- ── week_settings ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage week settings" ON public.week_settings;
CREATE POLICY "Admins can manage week settings" ON public.week_settings
  FOR ALL TO authenticated USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Only admins can modify week settings" ON public.week_settings;
CREATE POLICY "Only admins can modify week settings" ON public.week_settings
  FOR ALL USING (public.is_current_user_admin());

-- ── email_jobs (keep the service/legacy auth.uid() IS NULL + own-row terms) ─
DROP POLICY IF EXISTS "Allow email job deletion" ON public.email_jobs;
CREATE POLICY "Allow email job deletion" ON public.email_jobs
  FOR DELETE USING ((auth.uid() IS NULL) OR public.is_current_user_admin());

DROP POLICY IF EXISTS "Allow email job updates" ON public.email_jobs;
CREATE POLICY "Allow email job updates" ON public.email_jobs
  FOR UPDATE USING (
    (auth.uid() IS NULL) OR (auth.uid() = user_id) OR public.is_current_user_admin()
  );

-- ── anonymous_picks ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage all anonymous picks" ON public.anonymous_picks;
CREATE POLICY "Admins can manage all anonymous picks" ON public.anonymous_picks
  FOR ALL TO authenticated USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Allow admins to manage pick sets" ON public.anonymous_picks;
CREATE POLICY "Allow admins to manage pick sets" ON public.anonymous_picks
  FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Allow admins to update validation status" ON public.anonymous_picks;
CREATE POLICY "Allow admins to update validation status" ON public.anonymous_picks
  FOR UPDATE TO authenticated USING (public.is_current_user_admin());

-- ── admin_email_settings (consolidate the two duplicate generations into one) ─
DROP POLICY IF EXISTS "Admins can insert email settings" ON public.admin_email_settings;
DROP POLICY IF EXISTS "Admins can update email settings" ON public.admin_email_settings;
DROP POLICY IF EXISTS "Admins can view email settings" ON public.admin_email_settings;
DROP POLICY IF EXISTS "admin_email_settings_select" ON public.admin_email_settings;
DROP POLICY IF EXISTS "admin_email_settings_insert" ON public.admin_email_settings;
DROP POLICY IF EXISTS "admin_email_settings_update" ON public.admin_email_settings;
DROP POLICY IF EXISTS "admin_email_settings_delete" ON public.admin_email_settings;

CREATE POLICY "admin_email_settings_select" ON public.admin_email_settings
  FOR SELECT USING (public.is_current_user_admin());
CREATE POLICY "admin_email_settings_insert" ON public.admin_email_settings
  FOR INSERT WITH CHECK (public.is_current_user_admin());
CREATE POLICY "admin_email_settings_update" ON public.admin_email_settings
  FOR UPDATE USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());
CREATE POLICY "admin_email_settings_delete" ON public.admin_email_settings
  FOR DELETE USING (public.is_current_user_admin());

-- ── user_emails ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage all emails" ON public.user_emails;
CREATE POLICY "Admins can manage all emails" ON public.user_emails
  FOR ALL USING (public.is_current_user_admin());

-- ── user_merge_history ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Only admins can create merge history" ON public.user_merge_history;
CREATE POLICY "Only admins can create merge history" ON public.user_merge_history
  FOR INSERT WITH CHECK (public.is_current_user_admin());

-- ── pick_precedence_audit ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage pick precedence audit" ON public.pick_precedence_audit;
CREATE POLICY "Admins can manage pick precedence audit" ON public.pick_precedence_audit
  FOR ALL USING (public.is_current_user_admin());

-- ── user_pick_preferences / user_pick_set_preferences / user_custom_pick_combinations ─
DROP POLICY IF EXISTS "Admin full access to pick preferences" ON public.user_pick_preferences;
CREATE POLICY "Admin full access to pick preferences" ON public.user_pick_preferences
  FOR ALL USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin full access to pick set preferences" ON public.user_pick_set_preferences;
CREATE POLICY "Admin full access to pick set preferences" ON public.user_pick_set_preferences
  FOR ALL USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin full access to custom pick combinations" ON public.user_custom_pick_combinations;
CREATE POLICY "Admin full access to custom pick combinations" ON public.user_custom_pick_combinations
  FOR ALL USING (public.is_current_user_admin());

-- ── season_winners ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete season winners" ON public.season_winners;
CREATE POLICY "Admins can delete season winners" ON public.season_winners
  FOR DELETE TO authenticated USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can insert season winners" ON public.season_winners;
CREATE POLICY "Admins can insert season winners" ON public.season_winners
  FOR INSERT TO authenticated WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can update season winners" ON public.season_winners;
CREATE POLICY "Admins can update season winners" ON public.season_winners
  FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());
