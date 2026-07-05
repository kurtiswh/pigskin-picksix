-- Migration 168: make the admin check tolerate auth.uid() != public.users.id
--
-- Some admin accounts have a mismatch between their auth.users.id (the JWT sub /
-- auth.uid()) and their public.users.id — leftover from account merges. Example:
-- kurtiswh@gmail.com is admin in public.users (id ba84da74…) but their auth.users
-- id is 3cc7c1aa…. Every RLS check of the form "WHERE users.id = auth.uid()"
-- therefore fails to see them as admin, even though the app (which matches by
-- email) shows them the admin UI. This blocked admin-only writes like creating a
-- blog post (recap drafts) -> 403.
--
-- Fix: is_current_user_admin() also matches the admin row by the JWT email claim
-- (auth.jwt()->>'email'), which Supabase verifies at login. Then repoint the
-- blog_posts admin policies at that helper (they used an inline id-only subquery).
--
-- NOTE: the underlying id mismatch still affects other auth.uid()=user_id RLS for
-- those accounts (picks/payments). Tracked separately as data cleanup; this only
-- fixes admin recognition.

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE is_admin = true
      AND (
        id = auth.uid()
        OR lower(email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
      )
  );
$$;

-- Repoint blog_posts admin policies at the helper (were inline id=auth.uid() subqueries).
DROP POLICY IF EXISTS "Admin users can insert posts" ON public.blog_posts;
CREATE POLICY "Admin users can insert posts" ON public.blog_posts
  FOR INSERT WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin users can update all posts" ON public.blog_posts;
CREATE POLICY "Admin users can update all posts" ON public.blog_posts
  FOR UPDATE USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin users can delete posts" ON public.blog_posts;
CREATE POLICY "Admin users can delete posts" ON public.blog_posts
  FOR DELETE USING (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admin users can read all posts" ON public.blog_posts;
CREATE POLICY "Admin users can read all posts" ON public.blog_posts
  FOR SELECT USING (public.is_current_user_admin());
