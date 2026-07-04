-- Migration 156: Fix "infinite recursion detected in policy for relation users"
--
-- The policy "Admins can manage all users" ON public.users checked admin status
-- with EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true).
-- Because the policy is ON users and READS users, Postgres recurses. And since
-- many other tables' admin policies also subquery users, any admin query that
-- touches users trips it -> breaks Pick Management, Score Updates, Bracket
-- Winners, Scheduled Functions, etc.
--
-- FIX: move the admin check into a SECURITY DEFINER function that reads users
-- while bypassing RLS, and point the policy at it. This breaks the recursion
-- everywhere (other tables' subqueries on users then resolve cleanly).

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin FROM public.users WHERE id = auth.uid()), false);
$$;

-- Allow the app roles to call it.
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO anon, authenticated;

DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
CREATE POLICY "Admins can manage all users" ON public.users
  FOR ALL
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());
