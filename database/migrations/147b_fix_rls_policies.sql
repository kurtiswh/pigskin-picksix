-- Fix RLS policies for season_winners table
-- The UPDATE operation needs both USING and WITH CHECK clauses

-- Drop existing policy
DROP POLICY IF EXISTS "Only admins can manage season winners" ON public.season_winners;

-- Create separate policies for INSERT, UPDATE, DELETE
CREATE POLICY "Admins can insert season winners"
    ON public.season_winners
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

CREATE POLICY "Admins can update season winners"
    ON public.season_winners
    FOR UPDATE
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

CREATE POLICY "Admins can delete season winners"
    ON public.season_winners
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Verify policies
DO $$
BEGIN
    RAISE NOTICE '✅ RLS policies updated for season_winners';
    RAISE NOTICE 'Run this to verify:';
    RAISE NOTICE 'SELECT policyname FROM pg_policies WHERE tablename = ''season_winners'';';
END $$;
