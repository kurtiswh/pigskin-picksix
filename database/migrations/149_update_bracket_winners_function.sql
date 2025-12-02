-- Migration 149: Create function to update bracket winners with SECURITY DEFINER
--
-- PURPOSE: Bypass RLS by creating a SECURITY DEFINER function that admins can call
--
-- This function will run with the permissions of the function owner (superuser),
-- bypassing RLS policies that might be blocking the update

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 149: CREATE BRACKET WINNERS UPDATE FUNCTION';
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'Creating SECURITY DEFINER function to bypass RLS';
    RAISE NOTICE '';
END;
$$;

-- Create function to update bracket winners (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION update_bracket_winners(
    p_season INTEGER,
    p_winner_id UUID,
    p_second_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_row_id UUID;
    v_result JSONB;
BEGIN
    -- Only allow admins to call this function
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = auth.uid()
        AND is_admin = true
    ) THEN
        RAISE EXCEPTION 'Only admins can update bracket winners';
    END IF;

    -- Get or create the season winners row
    SELECT get_or_create_season_winners(p_season) INTO v_row_id;

    -- Update bracket winners (bypasses RLS due to SECURITY DEFINER)
    UPDATE public.season_winners
    SET
        bracket_winner_user_id = p_winner_id,
        bracket_second_user_id = p_second_id,
        updated_at = NOW()
    WHERE season = p_season
    RETURNING jsonb_build_object(
        'id', id,
        'season', season,
        'bracket_winner_user_id', bracket_winner_user_id,
        'bracket_second_user_id', bracket_second_user_id,
        'updated_at', updated_at
    ) INTO v_result;

    -- Return the updated row
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_bracket_winners IS 'Updates bracket winners for a season (admin only, bypasses RLS)';

-- Grant execute permission to authenticated users (function checks admin status internally)
GRANT EXECUTE ON FUNCTION update_bracket_winners TO authenticated;

-- Verify function was created
DO $$
DECLARE
    function_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.proname = 'update_bracket_winners'
    ) INTO function_exists;

    IF function_exists THEN
        RAISE NOTICE '✅ update_bracket_winners function created successfully';
    ELSE
        RAISE WARNING '⚠️  Failed to create update_bracket_winners function';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 149 COMPLETED!';
    RAISE NOTICE '';
END;
$$;
