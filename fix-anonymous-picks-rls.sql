-- Fix RLS policies for anonymous_picks table

-- Check if anonymous_picks table exists and its current policies
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'anonymous_picks';
SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anonymous_picks';

-- Drop any existing policies that might be blocking access
DROP POLICY IF EXISTS "anonymous_picks_insert" ON public.anonymous_picks;
DROP POLICY IF EXISTS "anonymous_picks_select" ON public.anonymous_picks;
DROP POLICY IF EXISTS "authenticated_anonymous_picks" ON public.anonymous_picks;
DROP POLICY IF EXISTS "anon_anonymous_picks" ON public.anonymous_picks;

-- Create permissive policies to allow anonymous users to insert picks
CREATE POLICY "anon_can_insert_picks" ON public.anonymous_picks
    FOR INSERT 
    TO anon
    WITH CHECK (true);

CREATE POLICY "anon_can_select_picks" ON public.anonymous_picks
    FOR SELECT 
    TO anon
    USING (true);

-- Also allow authenticated users to insert/view anonymous picks (for admin purposes)
CREATE POLICY "authenticated_can_manage_anonymous_picks" ON public.anonymous_picks
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Verify the policies were created
SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'anonymous_picks';