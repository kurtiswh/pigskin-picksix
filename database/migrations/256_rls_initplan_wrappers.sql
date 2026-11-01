-- 256: evaluate per-user RLS checks once per query, not once per row
--
-- After 255 removed the blanket USING (true) read policies, reads of users, picks and
-- anonymous_picks fall through to the older policies, which call is_current_user_admin()
-- and is_current_user(x) for every row. Measured 2026-11-01: ~0.3 ms per row, so an admin
-- reading one week of anonymous_picks took 118 ms and season-wide reads ran for seconds.
--
-- Wrapping the calls in (SELECT ...) lets Postgres run them once as an InitPlan
-- (Supabase's documented RLS performance pattern). Who can see or change what is
-- unchanged:
--   is_current_user(x)  =  x IS NOT NULL AND x = current_player_id()
--   x = (SELECT current_player_id())  is false/NULL for a NULL x, so it is equivalent.
-- Policies are altered in place (no drop/recreate), so there is no window without them.

-- anonymous_picks
ALTER POLICY "Admins can manage all anonymous picks" ON public.anonymous_picks
  USING ((SELECT public.is_current_user_admin()));
ALTER POLICY "Allow admins to manage pick sets" ON public.anonymous_picks
  USING ((SELECT public.is_current_user_admin()))
  WITH CHECK ((SELECT public.is_current_user_admin()));
ALTER POLICY "Allow admins to update validation status" ON public.anonymous_picks
  USING ((SELECT public.is_current_user_admin()));
ALTER POLICY "Users can manage assigned anonymous picks" ON public.anonymous_picks
  USING (assigned_user_id = (SELECT public.current_player_id()));

-- picks
ALTER POLICY "Admins can manage all picks" ON public.picks
  USING ((SELECT public.is_current_user_admin()));

-- users
ALTER POLICY "Admins can manage all users" ON public.users
  USING ((SELECT public.is_current_user_admin()))
  WITH CHECK ((SELECT public.is_current_user_admin()));
ALTER POLICY "Users can manage own profile" ON public.users
  USING (id = (SELECT public.current_player_id()));
