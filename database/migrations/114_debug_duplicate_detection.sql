-- Migration 114: Add Debug Function for Duplicate Detection
-- 
-- PURPOSE: Create debug function to understand why duplicate detection isn't working

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 114: Adding debug function for duplicate detection';
    RAISE NOTICE '==============================================================';
END;
$$;

-- Create a debug function that can be called to investigate duplicate detection
CREATE OR REPLACE FUNCTION public.debug_duplicate_picks(target_season INTEGER DEFAULT 2025)
RETURNS TABLE(
    debug_step TEXT,
    user_name TEXT,
    user_id UUID,
    week INTEGER,
    pick_source TEXT,
    pick_count BIGINT,
    lock_count BIGINT,
    show_on_leaderboard BOOLEAN,
    assigned_user_id UUID
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    -- Step 1: Show authenticated picks for problem users
    RETURN QUERY
    SELECT 
        '1. AUTHENTICATED PICKS' as debug_step,
        u.display_name as user_name,
        p.user_id,
        p.week,
        'authenticated' as pick_source,
        COUNT(*)::BIGINT as pick_count,
        COUNT(CASE WHEN p.is_lock THEN 1 END)::BIGINT as lock_count,
        true as show_on_leaderboard, -- authenticated picks always show
        p.user_id as assigned_user_id
    FROM public.picks p
    JOIN public.users u ON p.user_id = u.id
    WHERE p.season = target_season
      AND u.display_name IN ('Jimmy Nummy', 'Walker Harlow', 'Clark T')
    GROUP BY u.display_name, p.user_id, p.week
    ORDER BY u.display_name, p.week;

    -- Step 2: Show anonymous picks for problem users  
    RETURN QUERY
    SELECT 
        '2. ANONYMOUS PICKS' as debug_step,
        u.display_name as user_name,
        ap.assigned_user_id as user_id,
        ap.week,
        'anonymous' as pick_source,
        COUNT(*)::BIGINT as pick_count,
        COUNT(CASE WHEN ap.is_lock THEN 1 END)::BIGINT as lock_count,
        ap.show_on_leaderboard,
        ap.assigned_user_id
    FROM public.anonymous_picks ap
    JOIN public.users u ON ap.assigned_user_id = u.id
    WHERE ap.season = target_season
      AND u.display_name IN ('Jimmy Nummy', 'Walker Harlow', 'Clark T')
      AND ap.assigned_user_id IS NOT NULL
    GROUP BY u.display_name, ap.assigned_user_id, ap.week, ap.show_on_leaderboard
    ORDER BY u.display_name, ap.week;

    -- Step 3: Show what the view logic produces
    RETURN QUERY
    WITH user_pick_analysis AS (
        SELECT DISTINCT
            u.id as user_id,
            u.display_name,
            p.season,
            p.week,
            'authenticated' as pick_source,
            COUNT(*) OVER (PARTITION BY u.id, p.season, p.week) as pick_count,
            COUNT(CASE WHEN p.is_lock THEN 1 END) OVER (PARTITION BY u.id, p.season, p.week) as lock_count
        FROM public.users u
        JOIN public.picks p ON u.id = p.user_id
        WHERE p.season = target_season
          AND u.display_name IN ('Jimmy Nummy', 'Walker Harlow', 'Clark T')
        
        UNION ALL
        
        SELECT DISTINCT
            u.id as user_id,
            u.display_name,
            ap.season,
            ap.week,
            'anonymous' as pick_source,
            COUNT(*) OVER (PARTITION BY u.id, ap.season, ap.week) as pick_count,
            COUNT(CASE WHEN ap.is_lock THEN 1 END) OVER (PARTITION BY u.id, ap.season, ap.week) as lock_count
        FROM public.users u
        JOIN public.anonymous_picks ap ON u.id = ap.assigned_user_id
        WHERE ap.season = target_season
          AND u.display_name IN ('Jimmy Nummy', 'Walker Harlow', 'Clark T')
          AND ap.show_on_leaderboard = true
    )
    SELECT 
        '3. VIEW ANALYSIS' as debug_step,
        upa.display_name as user_name,
        upa.user_id,
        upa.week,
        upa.pick_source,
        upa.pick_count,
        upa.lock_count,
        true as show_on_leaderboard, -- placeholder
        upa.user_id as assigned_user_id
    FROM user_pick_analysis upa
    ORDER BY upa.display_name, upa.week, upa.pick_source;
END;
$$;

-- Create a simple check function to see actual duplicate scenarios
CREATE OR REPLACE FUNCTION public.check_actual_duplicates(target_season INTEGER DEFAULT 2025)
RETURNS TABLE(
    user_name TEXT,
    user_id UUID,
    week INTEGER,
    auth_picks BIGINT,
    anon_picks BIGINT,
    total_picks BIGINT,
    has_both BOOLEAN
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH auth_counts AS (
        SELECT 
            u.display_name,
            p.user_id,
            p.week,
            COUNT(*) as auth_count
        FROM public.picks p
        JOIN public.users u ON p.user_id = u.id
        WHERE p.season = target_season
        GROUP BY u.display_name, p.user_id, p.week
    ),
    anon_counts AS (
        SELECT 
            u.display_name,
            ap.assigned_user_id as user_id,
            ap.week,
            COUNT(*) as anon_count
        FROM public.anonymous_picks ap
        JOIN public.users u ON ap.assigned_user_id = u.id
        WHERE ap.season = target_season
          AND ap.show_on_leaderboard = true
          AND ap.assigned_user_id IS NOT NULL
        GROUP BY u.display_name, ap.assigned_user_id, ap.week
    )
    SELECT 
        COALESCE(ac.display_name, anc.display_name) as user_name,
        COALESCE(ac.user_id, anc.user_id) as user_id,
        COALESCE(ac.week, anc.week) as week,
        COALESCE(ac.auth_count, 0)::BIGINT as auth_picks,
        COALESCE(anc.anon_count, 0)::BIGINT as anon_picks,
        (COALESCE(ac.auth_count, 0) + COALESCE(anc.anon_count, 0))::BIGINT as total_picks,
        (COALESCE(ac.auth_count, 0) > 0 AND COALESCE(anc.anon_count, 0) > 0) as has_both
    FROM auth_counts ac
    FULL OUTER JOIN anon_counts anc ON ac.user_id = anc.user_id AND ac.week = anc.week
    WHERE (COALESCE(ac.auth_count, 0) + COALESCE(anc.anon_count, 0)) > 6
       OR (COALESCE(ac.auth_count, 0) > 0 AND COALESCE(anc.anon_count, 0) > 0)
    ORDER BY user_name, week;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.debug_duplicate_picks(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_actual_duplicates(INTEGER) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 114 COMPLETED - Debug functions added!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 NEW DEBUG FUNCTIONS:';
    RAISE NOTICE '• debug_duplicate_picks(season) - Step-by-step analysis';
    RAISE NOTICE '• check_actual_duplicates(season) - Simple duplicate check';
    RAISE NOTICE '';
    RAISE NOTICE '📝 Usage: SELECT * FROM debug_duplicate_picks(2025);';
    RAISE NOTICE '📝 Usage: SELECT * FROM check_actual_duplicates(2025);';
END;
$$;