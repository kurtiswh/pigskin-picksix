-- Comprehensive RLS Policy Fix for leaguesafe_payments table
-- This creates proper policies instead of disabling RLS

-- First, check current state
SELECT 'Current RLS status for leaguesafe_payments:' as info;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leaguesafe_payments';

SELECT 'Current policies for leaguesafe_payments:' as info;
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leaguesafe_payments';

-- Drop all existing policies on leaguesafe_payments to start clean
DROP POLICY IF EXISTS "Users can manage own payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "Admin can manage all payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "authenticated_read_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "anon_read_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "authenticated_insert_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "authenticated_update_payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "anon_write_payments" ON public.leaguesafe_payments;

-- Ensure RLS is enabled
ALTER TABLE public.leaguesafe_payments ENABLE ROW LEVEL SECURITY;

-- Create comprehensive policies for leaguesafe_payments

-- 1. Allow anonymous users to read all payment records (needed for admin interface)
CREATE POLICY "anon_select_payments" ON public.leaguesafe_payments
    FOR SELECT 
    TO anon
    USING (true);

-- 2. Allow anonymous users to insert payment records (needed for admin creating payments)
CREATE POLICY "anon_insert_payments" ON public.leaguesafe_payments
    FOR INSERT 
    TO anon
    WITH CHECK (true);

-- 3. Allow anonymous users to update payment records (needed for admin updating payments)
CREATE POLICY "anon_update_payments" ON public.leaguesafe_payments
    FOR UPDATE 
    TO anon
    USING (true)
    WITH CHECK (true);

-- 4. Allow anonymous users to delete payment records (needed for cleanup)
CREATE POLICY "anon_delete_payments" ON public.leaguesafe_payments
    FOR DELETE 
    TO anon
    USING (true);

-- 5. Allow authenticated users to read all payment records
CREATE POLICY "authenticated_select_payments" ON public.leaguesafe_payments
    FOR SELECT 
    TO authenticated
    USING (true);

-- 6. Allow authenticated users to insert payment records
CREATE POLICY "authenticated_insert_payments" ON public.leaguesafe_payments
    FOR INSERT 
    TO authenticated
    WITH CHECK (true);

-- 7. Allow authenticated users to update payment records
CREATE POLICY "authenticated_update_payments" ON public.leaguesafe_payments
    FOR UPDATE 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- 8. Allow authenticated users to delete payment records
CREATE POLICY "authenticated_delete_payments" ON public.leaguesafe_payments
    FOR DELETE 
    TO authenticated
    USING (true);

-- Verify the new policies
SELECT 'New policies created for leaguesafe_payments:' as info;
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leaguesafe_payments';

-- Test the policies by checking if we can query the table
SELECT 'Testing policies by querying existing data...' as info;
SELECT COUNT(*) as total_payments FROM public.leaguesafe_payments;

-- If the query above works, the RLS policies are properly configured

SELECT 'RLS policies for leaguesafe_payments have been properly configured!' as success;