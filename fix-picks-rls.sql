-- Fix RLS policies for picks table to allow authenticated users to manage their picks

-- Check current policies on picks table
SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'picks';

-- Drop any existing problematic policies
DROP POLICY IF EXISTS "Users can view own picks" ON public.picks;
DROP POLICY IF EXISTS "Users can insert own picks" ON public.picks;
DROP POLICY IF EXISTS "Users can update own picks" ON public.picks;
DROP POLICY IF EXISTS "Users can delete own picks" ON public.picks;
DROP POLICY IF EXISTS "authenticated_picks_select" ON public.picks;
DROP POLICY IF EXISTS "authenticated_picks_insert" ON public.picks;
DROP POLICY IF EXISTS "authenticated_picks_update" ON public.picks;
DROP POLICY IF EXISTS "authenticated_picks_delete" ON public.picks;

-- Create comprehensive policies for authenticated users to manage their own picks
CREATE POLICY "authenticated_can_view_own_picks" ON public.picks
    FOR SELECT 
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "authenticated_can_insert_own_picks" ON public.picks
    FOR INSERT 
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated_can_update_own_picks" ON public.picks
    FOR UPDATE 
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "authenticated_can_delete_own_picks" ON public.picks
    FOR DELETE 
    TO authenticated
    USING (user_id = auth.uid());

-- Also allow admins to view all picks for management purposes
CREATE POLICY "admins_can_manage_all_picks" ON public.picks
    FOR ALL 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    );

-- Verify the policies were created
SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'picks';