-- Migration 150: Fix bracket winners function with better auth checking
--
-- PURPOSE: Update the function to provide better debugging and handle auth properly

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 150: FIX BRACKET WINNERS AUTH';
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Updating function with better auth handling';
    RAISE NOTICE '';
END;
$$;

-- Drop and recreate the function with better error messages
CREATE OR REPLACE FUNCTION update_bracket_winners(
    p_season INTEGER,
    p_winner_id UUID,
    p_second_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_row_id UUID;
    v_result JSONB;
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    -- Get current user ID
    v_user_id := auth.uid();

    -- Log for debugging
    RAISE NOTICE 'Current user ID: %', v_user_id;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated - please log in';
    END IF;

    -- Check if user is admin
    SELECT is_admin INTO v_is_admin
    FROM public.users
    WHERE id = v_user_id;

    -- Log for debugging
    RAISE NOTICE 'User is_admin value: %', v_is_admin;

    IF v_is_admin IS NULL THEN
        RAISE EXCEPTION 'User not found in users table (ID: %)', v_user_id;
    END IF;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'User is not an admin (ID: %, is_admin: %)', v_user_id, v_is_admin;
    END IF;

    -- Get or create the season winners row
    SELECT get_or_create_season_winners(p_season) INTO v_row_id;

    RAISE NOTICE 'Season winners row ID: %', v_row_id;

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

    IF v_result IS NULL THEN
        RAISE EXCEPTION 'Failed to update season % - row not found', p_season;
    END IF;

    RAISE NOTICE 'Update successful: %', v_result;

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
        RAISE NOTICE '✅ update_bracket_winners function updated successfully';
    ELSE
        RAISE WARNING '⚠️  Failed to update update_bracket_winners function';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 150 COMPLETED!';
    RAISE NOTICE '';
END;
$$;
