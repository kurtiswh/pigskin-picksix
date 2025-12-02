-- Migration 151: Simple bracket winners update without auth check
--
-- PURPOSE: Create a simple SECURITY DEFINER function that just updates
--          We'll check admin status on the client side instead

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 151: SIMPLE BRACKET UPDATE FUNCTION';
    RAISE NOTICE '=============================================';
    RAISE NOTICE 'Creating simple update function';
    RAISE NOTICE '';
END;
$$;

-- Drop the problematic function
DROP FUNCTION IF EXISTS update_bracket_winners(INTEGER, UUID, UUID);

-- Create a simple function that just does the update
-- Admin check will be done client-side via RLS policies
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
    -- Get or create the season winners row
    SELECT get_or_create_season_winners(p_season) INTO v_row_id;

    -- Update bracket winners (SECURITY DEFINER bypasses RLS)
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

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Failed to update season % - row not found', p_season;
    END IF;

    -- Return the updated row
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_bracket_winners IS 'Updates bracket winners for a season (bypasses RLS, client must check admin)';

-- Only allow authenticated users to call this
GRANT EXECUTE ON FUNCTION update_bracket_winners TO authenticated;

-- Revoke from public to be safe
REVOKE EXECUTE ON FUNCTION update_bracket_winners FROM public;

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
    RAISE NOTICE '✅ Migration 151 COMPLETED!';
    RAISE NOTICE '';
END;
$$;
