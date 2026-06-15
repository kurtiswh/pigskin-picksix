-- Quick fix for ambiguous user_id error
-- Drop and recreate the function with proper aliasing

DROP FUNCTION IF EXISTS public.get_user_picks_visibility_summary(INTEGER);

CREATE FUNCTION public.get_user_picks_visibility_summary(
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
    on_leaderboard BOOLEAN,
    auth_pick_breakdown TEXT,
    anon_pick_breakdown TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH user_auth_picks AS (
        SELECT 
            p.user_id,
            COUNT(*) as total_picks,
            COUNT(CASE WHEN p.show_on_leaderboard = FALSE THEN 1 END) as hidden_picks,
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM public.picks p2
                    WHERE p2.user_id = p.user_id 
                    AND p2.season = target_season
                    AND p2.show_in_combination = FALSE
                )
                THEN 
                    (
                        SELECT 
                            COUNT(CASE WHEN p3.show_in_combination = TRUE AND p3.show_on_leaderboard = TRUE THEN 1 END)::TEXT || '/' ||
                            COUNT(CASE WHEN p3.show_in_combination = TRUE THEN 1 END)::TEXT || ' visible (Set A), ' ||
                            COUNT(CASE WHEN p3.show_in_combination = FALSE AND p3.show_on_leaderboard = TRUE THEN 1 END)::TEXT || '/' ||
                            COUNT(CASE WHEN p3.show_in_combination = FALSE THEN 1 END)::TEXT || ' visible (Set B)'
                        FROM public.picks p3
                        WHERE p3.user_id = p.user_id 
                        AND p3.season = target_season
                        AND p3.submitted_at IS NOT NULL
                    )
                ELSE NULL
            END as pick_breakdown
        FROM public.picks p
        WHERE p.season = target_season
        AND p.submitted_at IS NOT NULL
        GROUP BY p.user_id
    ),
    user_anon_picks AS (
        SELECT 
            ap.assigned_user_id as user_id,
            COUNT(*) as total_picks,
            COUNT(CASE WHEN ap.show_on_leaderboard = FALSE THEN 1 END) as hidden_picks,
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM public.anonymous_picks ap2
                    WHERE ap2.assigned_user_id = ap.assigned_user_id 
                    AND ap2.season = target_season
                    AND ap2.show_in_combination = FALSE
                )
                THEN 
                    (
                        SELECT 
                            COUNT(CASE WHEN ap3.show_in_combination = TRUE AND ap3.show_on_leaderboard = TRUE THEN 1 END)::TEXT || '/' ||
                            COUNT(CASE WHEN ap3.show_in_combination = TRUE THEN 1 END)::TEXT || ' visible (Set A), ' ||
                            COUNT(CASE WHEN ap3.show_in_combination = FALSE AND ap3.show_on_leaderboard = TRUE THEN 1 END)::TEXT || '/' ||
                            COUNT(CASE WHEN ap3.show_in_combination = FALSE THEN 1 END)::TEXT || ' visible (Set B)'
                        FROM public.anonymous_picks ap3
                        WHERE ap3.assigned_user_id = ap.assigned_user_id 
                        AND ap3.season = target_season
                        AND ap3.validation_status IN ('auto_validated', 'manually_validated')
                    )
                ELSE NULL
            END as pick_breakdown
        FROM public.anonymous_picks ap
        WHERE ap.season = target_season
        AND ap.assigned_user_id IS NOT NULL
        AND ap.validation_status IN ('auto_validated', 'manually_validated')
        GROUP BY ap.assigned_user_id
    ),
    all_users AS (
        SELECT DISTINCT au_user_id as user_id FROM (
            SELECT uap1.user_id as au_user_id FROM user_auth_picks uap1
            UNION 
            SELECT uan1.user_id as au_user_id FROM user_anon_picks uan1
        ) combined_users
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
        (sl.user_id IS NOT NULL) as on_leaderboard,
        uap.pick_breakdown as auth_pick_breakdown,
        uan.pick_breakdown as anon_pick_breakdown
    FROM all_users au
    JOIN public.users u ON au.user_id = u.id
    LEFT JOIN user_auth_picks uap ON u.id = uap.user_id
    LEFT JOIN user_anon_picks uan ON u.id = uan.user_id
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = target_season
    LEFT JOIN public.season_leaderboard sl ON u.id = sl.user_id AND sl.season = target_season
    ORDER BY u.display_name;
END;
$$;

-- Test it
SELECT * FROM public.get_user_picks_visibility_summary(2024) LIMIT 5;