-- Migration 181: app_settings admin write blocked for merged-account admins
--
-- PROBLEM:
--   Saving Season Settings reported success but changed nothing. The
--   app_settings_admin_write policy (migration 153) uses an inline
--   "users.id = auth.uid() AND is_admin" subquery, which fails for admin
--   accounts whose auth.users.id != public.users.id (the account-merge
--   mismatch documented in migration 168). The UPDATE matches 0 rows, and
--   PostgREST treats that as success, so the UI showed "Saved" anyway.
--
-- FIX:
--   Repoint the policy at is_current_user_admin(), which matches by id OR
--   verified JWT email (and is SECURITY DEFINER, so it also dodges users-table
--   RLS). Same fix migration 168 applied to blog_posts.

DROP POLICY IF EXISTS app_settings_admin_write ON public.app_settings;
CREATE POLICY app_settings_admin_write ON public.app_settings
    FOR ALL TO authenticated
    USING (public.is_current_user_admin())
    WITH CHECK (public.is_current_user_admin());
