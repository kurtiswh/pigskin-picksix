-- 174: Fix leaguesafe_payments admin RLS so admins can actually read/manage payments.
--
-- Problem: the "Admins can manage all payments" policy checked
--   EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND is_admin)
-- but several admin accounts have public.users.id != auth.uid() (their public
-- user row was created with a generated id, not the auth.users id). For those
-- admins the check failed, so the client received 0 payment rows — making the
-- admin "People" page report 0 paid users even though 600+ paid.
--
-- Fix: use the existing SECURITY DEFINER helper is_current_user_admin(), which
-- already matches admins by (id = auth.uid() OR email = jwt email), the same
-- way the users table's admin policy does.

DROP POLICY IF EXISTS "Admins can manage all payments" ON public.leaguesafe_payments;

CREATE POLICY "Admins can manage all payments"
  ON public.leaguesafe_payments
  FOR ALL
  TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());
