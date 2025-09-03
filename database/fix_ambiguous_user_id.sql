-- Fix Ambiguous user_id Column Error in get_user_picks_visibility_summary
-- This fixes the "column reference 'user_id' is ambiguous" error

DO $$
BEGIN
    RAISE NOTICE '🔧 Fixing ambiguous user_id column error';
    RAISE NOTICE '=========================================';
END;
$$;

-- Drop and recreate the function with proper table aliases
DROP FUNCTION IF EXISTS public.get_user_picks_visibility_summary(INTEGER);

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
            COUNT(CASE WHEN COALESCE(p.show_on_leaderboard, TRUE) = FALSE THEN 1 END) as hidden_picks
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
        SELECT uap.user_id FROM user_auth_picks uap
        UNION 
        SELECT uan.user_id FROM user_anon_picks uan
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

-- Also ensure pick_source column exists in leaderboard tables
DO $$
BEGIN
    -- Add pick_source to season_leaderboard if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'season_leaderboard' 
        AND column_name = 'pick_source'
    ) THEN
        ALTER TABLE public.season_leaderboard 
        ADD COLUMN pick_source VARCHAR(20) DEFAULT 'authenticated';
        RAISE NOTICE '✅ Added pick_source column to season_leaderboard';
    END IF;
    
    -- Add pick_source to weekly_leaderboard if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'weekly_leaderboard' 
        AND column_name = 'pick_source'
    ) THEN
        ALTER TABLE public.weekly_leaderboard 
        ADD COLUMN pick_source VARCHAR(20) DEFAULT 'authenticated';
        RAISE NOTICE '✅ Added pick_source column to weekly_leaderboard';
    END IF;
END;
$$;

-- Summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Fixed ambiguous user_id column error!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Changes made:';
    RAISE NOTICE '   - Fixed get_user_picks_visibility_summary function';
    RAISE NOTICE '   - Added proper table aliases to avoid ambiguity';
    RAISE NOTICE '   - Ensured pick_source columns exist in leaderboard tables';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 The Admin Leaderboard interface should now work properly!';
END;
$$;