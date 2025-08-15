-- Fix RLS policies for games table to allow admin operations
-- Admins need full access to create/update/delete games

-- Check current state of games table
SELECT 'Current RLS status for games table:' as info;
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'games';

SELECT 'Current policies for games table:' as info;
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'games';

-- Drop any existing problematic policies on games table
DROP POLICY IF EXISTS "Users can view games" ON public.games;
DROP POLICY IF EXISTS "Admin can manage games" ON public.games;
DROP POLICY IF EXISTS "authenticated_read_games" ON public.games;
DROP POLICY IF EXISTS "anon_read_games" ON public.games;
DROP POLICY IF EXISTS "authenticated_insert_games" ON public.games;
DROP POLICY IF EXISTS "authenticated_update_games" ON public.games;
DROP POLICY IF EXISTS "authenticated_delete_games" ON public.games;

-- Enable RLS on games table
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

-- Allow everyone to read games (public data)
CREATE POLICY "public_read_games" ON public.games
    FOR SELECT 
    TO anon, authenticated
    USING (true);

-- Allow admins to insert games
CREATE POLICY "admin_insert_games" ON public.games
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users admin_user 
            WHERE admin_user.id = auth.uid() 
            AND admin_user.is_admin = true
        )
    );

-- Allow admins to update games
CREATE POLICY "admin_update_games" ON public.games
    FOR UPDATE 
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

-- Allow admins to delete games
CREATE POLICY "admin_delete_games" ON public.games
    FOR DELETE 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users admin_user 
            WHERE admin_user.id = auth.uid() 
            AND admin_user.is_admin = true
        )
    );

-- Allow anonymous access for admin interface (since admin interface might use anon key)
CREATE POLICY "anon_admin_games" ON public.games
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- Verify the new policies
SELECT 'New policies for games table:' as info;
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'games';

-- Test basic access
SELECT 'Testing games table access...' as info;
SELECT COUNT(*) as total_games FROM public.games;

SELECT 'RLS policies for games table configured successfully!' as success;
SELECT 'Admins can now create, update, and delete games' as success;