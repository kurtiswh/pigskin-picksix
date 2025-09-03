-- Migration 122: Add user picks visibility summary function for admin interface
-- 
-- PURPOSE: Support admin interface for controlling leaderboard visibility

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 122: Add visibility summary function';
    RAISE NOTICE '==================================================';
END;
$$;

-- Create function to get user picks visibility summary
CREATE OR REPLACE FUNCTION public.get_user_picks_visibility_summary(
    target_season INTEGER
)
RETURNS TABLE(
    user_id UUID,
    display_name TEXT,
    total_auth_picks INTEGER,
    total_anon_picks INTEGER,
    hidden_auth_picks INTEGER,
    hidden_anon_picks INTEGER,
    payment_status TEXT,
    on_leaderboard BOOLEAN
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH user_auth_picks AS (
        SELECT 
            p.user_id,
            COUNT(*) as total_picks,
            COUNT(CASE WHEN p.show_on_leaderboard = FALSE THEN 1 END) as hidden_picks
        FROM public.picks p
        WHERE p.season = target_season
        AND p.submitted_at IS NOT NULL
        GROUP BY p.user_id
    ),
    user_anon_picks AS (
        SELECT 
            ap.assigned_user_id as user_id,
            COUNT(*) as total_picks,
            COUNT(CASE WHEN ap.show_on_leaderboard = FALSE THEN 1 END) as hidden_picks
        FROM public.anonymous_picks ap
        WHERE ap.season = target_season
        AND ap.assigned_user_id IS NOT NULL
        AND ap.validation_status IN ('auto_validated', 'manually_validated')
        GROUP BY ap.assigned_user_id
    ),
    all_users AS (
        SELECT user_id FROM user_auth_picks
        UNION 
        SELECT user_id FROM user_anon_picks
    )
    SELECT 
        u.id as user_id,
        u.display_name,
        COALESCE(uap.total_picks, 0)::INTEGER as total_auth_picks,
        COALESCE(uan.total_picks, 0)::INTEGER as total_anon_picks,
        COALESCE(uap.hidden_picks, 0)::INTEGER as hidden_auth_picks,
        COALESCE(uan.hidden_picks, 0)::INTEGER as hidden_anon_picks,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        (sl.user_id IS NOT NULL) as on_leaderboard
    FROM all_users au
    JOIN public.users u ON au.user_id = u.id
    LEFT JOIN user_auth_picks uap ON u.id = uap.user_id
    LEFT JOIN user_anon_picks uan ON u.id = uan.user_id
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = target_season
    LEFT JOIN public.season_leaderboard sl ON u.id = sl.user_id AND sl.season = target_season
    ORDER BY u.display_name;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.get_user_picks_visibility_summary IS 
'Admin function: Get summary of user picks and their leaderboard visibility status for admin interface';

-- Notify about completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 122 complete!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 New function available:';
    RAISE NOTICE '   - get_user_picks_visibility_summary(season) for admin interface';
    RAISE NOTICE '';
END;
$$;