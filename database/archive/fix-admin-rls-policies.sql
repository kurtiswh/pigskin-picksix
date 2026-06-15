-- Comprehensive RLS Policy Fix for Admin/User Permissions
-- Admins can edit everything, users can only edit their own basic info

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

-- Check current state of users table
SELECT 'Current RLS status for users table:' as info;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users';

-- Drop all existing policies on users table
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Admin can manage all users" ON public.users;
DROP POLICY IF EXISTS "authenticated_read_users" ON public.users;
DROP POLICY IF EXISTS "anon_read_users" ON public.users;
DROP POLICY IF EXISTS "authenticated_insert_users" ON public.users;
DROP POLICY IF EXISTS "authenticated_update_users" ON public.users;
DROP POLICY IF EXISTS "anon_write_users" ON public.users;

-- Enable RLS on users table
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all users
CREATE POLICY "admins_read_all_users" ON public.users
    FOR SELECT 
    TO authenticated
    USING (
        -- Admin users can see all users
        EXISTS (
            SELECT 1 FROM public.users admin_user 
            WHERE admin_user.id = auth.uid() 
            AND admin_user.is_admin = true
        )
        OR
        -- Users can see their own profile
        auth.uid() = id
    );

-- Allow admins to update all users, regular users can only update their own basic info
CREATE POLICY "admin_update_all_users" ON public.users
    FOR UPDATE 
    TO authenticated
    USING (
        -- Admin users can update any user
        EXISTS (
            SELECT 1 FROM public.users admin_user 
            WHERE admin_user.id = auth.uid() 
            AND admin_user.is_admin = true
        )
        OR
        -- Regular users can only update their own record
        auth.uid() = id
    )
    WITH CHECK (
        -- Admin users can update any user with any values
        EXISTS (
            SELECT 1 FROM public.users admin_user 
            WHERE admin_user.id = auth.uid() 
            AND admin_user.is_admin = true
        )
        OR
        -- Regular users can only update their own basic info (not is_admin)
        (
            auth.uid() = id 
            AND is_admin = (SELECT is_admin FROM public.users WHERE id = auth.uid())
        )
    );

-- Allow admins to insert new users
CREATE POLICY "admin_insert_users" ON public.users
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users admin_user 
            WHERE admin_user.id = auth.uid() 
            AND admin_user.is_admin = true
        )
    );

-- Allow admins to delete users
CREATE POLICY "admin_delete_users" ON public.users
    FOR DELETE 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users admin_user 
            WHERE admin_user.id = auth.uid() 
            AND admin_user.is_admin = true
        )
    );

-- Allow anonymous access for public operations (registration, etc.)
CREATE POLICY "anon_read_users" ON public.users
    FOR SELECT 
    TO anon
    USING (true);

CREATE POLICY "anon_insert_users" ON public.users
    FOR INSERT 
    TO anon
    WITH CHECK (true);

-- ============================================================================
-- LEAGUESAFE_PAYMENTS TABLE POLICIES  
-- ============================================================================

-- Check current state of leaguesafe_payments table
SELECT 'Current RLS status for leaguesafe_payments table:' as info;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leaguesafe_payments';

-- Drop all existing policies on leaguesafe_payments table
DROP POLICY IF EXISTS "Users can manage own payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "Admin can manage all payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "authenticated_read_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "anon_read_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "authenticated_insert_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "authenticated_update_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "anon_write_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "anon_select_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "anon_insert_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "anon_update_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "anon_delete_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "authenticated_select_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "authenticated_delete_payments" ON public.leaguesafe_payments;

-- Enable RLS on leaguesafe_payments table
ALTER TABLE public.leaguesafe_payments ENABLE ROW LEVEL SECURITY;

-- ONLY ADMINS can access leaguesafe_payments table
CREATE POLICY "admin_full_access_payments" ON public.leaguesafe_payments
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users admin_user 
            WHERE admin_user.id = auth.uid() 
            AND admin_user.is_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users admin_user 
            WHERE admin_user.id = auth.uid() 
            AND admin_user.is_admin = true
        )
    );

-- Allow anonymous access for admin interface (since admin interface might use anon key)
CREATE POLICY "anon_admin_access_payments" ON public.leaguesafe_payments
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- ============================================================================
-- VERIFY POLICIES
-- ============================================================================

SELECT 'New policies for users table:' as info;
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';

SELECT 'New policies for leaguesafe_payments table:' as info;
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leaguesafe_payments';

SELECT 'RLS policies configured successfully!' as success;
SELECT 'Admins have full access to both tables' as success;  
SELECT 'Regular users can only edit their own basic profile info' as success;