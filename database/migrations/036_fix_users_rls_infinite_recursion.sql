-- Fix infinite recursion in RLS policies for users table
-- The issue is caused by policies that check admin status by querying the users table they're protecting

-- Drop existing conflicting policies
DROP POLICY IF EXISTS "Users can view their own data" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can manage users" ON public.users;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can update any profile" ON public.users;
DROP POLICY IF EXISTS "Allow user creation during signup" ON public.users;
DROP POLICY IF EXISTS "anonymous_read_users" ON public.users;

-- Create simple, non-recursive policies
-- 1. Allow anonymous read access (needed for email validation)
CREATE POLICY "anonymous_read_users" ON public.users
    FOR SELECT TO anon
    USING (true);

-- 2. Allow authenticated users to read all profiles (needed for LeagueSafe uploads)
CREATE POLICY "authenticated_read_users" ON public.users
    FOR SELECT TO authenticated
    USING (true);

-- 3. Allow users to update their own profile
CREATE POLICY "users_update_own" ON public.users
    FOR UPDATE TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- 4. Allow user creation during signup (without recursion)
CREATE POLICY "allow_user_insert" ON public.users
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- 5. Allow service role (for admin operations like CSV uploads) to do everything
CREATE POLICY "service_role_all_access" ON public.users
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Also fix LeagueSafe payments policies to avoid admin recursion
DROP POLICY IF EXISTS "Admin users can manage leaguesafe payments" ON public.leaguesafe_payments;

-- Create simpler leaguesafe_payments policies
CREATE POLICY "authenticated_read_leaguesafe" ON public.leaguesafe_payments
    FOR SELECT TO authenticated
    USING (true);

CREATE POLICY "service_role_leaguesafe_all" ON public.leaguesafe_payments
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Add a function to safely check admin status (used by application logic, not RLS)
CREATE OR REPLACE FUNCTION public.is_user_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT COALESCE(is_admin, false) FROM public.users WHERE id = user_id;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.is_user_admin(UUID) TO authenticated;

-- Comment explaining the fix
COMMENT ON TABLE public.users IS 'RLS policies simplified to avoid infinite recursion. Admin checks now done at application level using is_user_admin() function.';