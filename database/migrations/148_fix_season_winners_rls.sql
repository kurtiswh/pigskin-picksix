-- Migration 148: Fix Season Winners RLS Policy
--
-- PURPOSE: Fix the RLS policy for season_winners to allow admin updates
--
-- ISSUE: The current policy uses USING clause for UPDATE operations,
--        but UPDATE operations need both USING and WITH CHECK clauses

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 148: FIX SEASON WINNERS RLS POLICY';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Fixing RLS policy to allow admin updates';
    RAISE NOTICE '';
END;
$$;

-- Drop the existing policy that's causing issues
DROP POLICY IF EXISTS "Only admins can manage season winners" ON public.season_winners;

-- Create separate policies for better clarity and functionality

-- Policy for INSERT (admins only)
CREATE POLICY "Admins can insert season winners"
    ON public.season_winners
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Policy for UPDATE (admins only)
-- UPDATE requires both USING (which rows can be updated) and WITH CHECK (validate new data)
CREATE POLICY "Admins can update season winners"
    ON public.season_winners
    FOR UPDATE
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

-- Policy for DELETE (admins only)
CREATE POLICY "Admins can delete season winners"
    ON public.season_winners
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Verify policies were created
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'season_winners';

    IF policy_count >= 4 THEN
        RAISE NOTICE '✅ RLS policies updated successfully (% policies)', policy_count;
    ELSE
        RAISE WARNING '⚠️  Expected 4+ policies, found %', policy_count;
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 148 COMPLETED!';
    RAISE NOTICE '';
END;
$$;
