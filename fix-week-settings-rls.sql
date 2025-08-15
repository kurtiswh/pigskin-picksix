-- Fix RLS policies for week_settings table to allow updates

-- Check current policies on week_settings
SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'week_settings';

-- Drop all existing policies on week_settings
DROP POLICY IF EXISTS "authenticated_week_settings_select" ON public.week_settings;
DROP POLICY IF EXISTS "authenticated_week_settings_insert" ON public.week_settings;
DROP POLICY IF EXISTS "authenticated_week_settings_update" ON public.week_settings;
DROP POLICY IF EXISTS "authenticated_week_settings_delete" ON public.week_settings;
DROP POLICY IF EXISTS "anon_week_settings_select" ON public.week_settings;
DROP POLICY IF EXISTS "anon_week_settings_update" ON public.week_settings;

-- Create permissive policies for week_settings
CREATE POLICY "authenticated_full_week_settings" ON public.week_settings
    FOR ALL 
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "anon_full_week_settings" ON public.week_settings
    FOR ALL 
    TO anon
    USING (true)
    WITH CHECK (true);

-- Verify the policies were created
SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'week_settings';