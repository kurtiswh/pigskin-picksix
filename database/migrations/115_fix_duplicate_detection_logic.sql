-- Migration 115: Fix Duplicate Detection Logic
-- 
-- PURPOSE: Fix duplicate detection to properly handle:
-- 1. Only count submitted picks (not drafts)
-- 2. Detect multiple anonymous pick sets for same user
-- 3. Group all anonymous picks per user regardless of email/set

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 115: Fixing duplicate detection logic';
    RAISE NOTICE '=======================================================';
END;
$$;

-- First, let's understand what makes a pick "submitted"
-- For authenticated picks: they should have a result or be past deadline
-- For anonymous picks: they should be assigned, validated, and show_on_leaderboard = true

-- Create improved duplicate detection function
CREATE OR REPLACE FUNCTION public.check_actual_duplicates_fixed(target_season INTEGER DEFAULT 2025)
RETURNS TABLE(
    user_name TEXT,
    user_id UUID,
    week INTEGER,
    auth_picks BIGINT,
    anon_picks BIGINT,
    anon_sets BIGINT,
    total_picks BIGINT,
    has_both BOOLEAN,
    issue_description TEXT
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
          AND p.submitted_at IS NOT NULL  -- Only count submitted picks
        GROUP BY u.display_name, p.user_id, p.week
    ),
    anon_counts AS (
        SELECT 
            u.display_name,
            ap.assigned_user_id as user_id,
            ap.week,
            COUNT(*) as anon_count,
            COUNT(DISTINCT ap.email) as anon_sets  -- Count distinct email sets
        FROM public.anonymous_picks ap
        JOIN public.users u ON ap.assigned_user_id = u.id
        WHERE ap.season = target_season
          AND ap.assigned_user_id IS NOT NULL
          AND ap.show_on_leaderboard = true
          AND ap.validation_status IN ('auto_validated', 'manually_validated')  -- Only validated picks
        GROUP BY u.display_name, ap.assigned_user_id, ap.week
    )
    SELECT 
        COALESCE(ac.display_name, anc.display_name) as user_name,
        COALESCE(ac.user_id, anc.user_id) as user_id,
        COALESCE(ac.week, anc.week) as week,
        COALESCE(ac.auth_count, 0)::BIGINT as auth_picks,
        COALESCE(anc.anon_count, 0)::BIGINT as anon_picks,
        COALESCE(anc.anon_sets, 0)::BIGINT as anon_sets,
        (COALESCE(ac.auth_count, 0) + COALESCE(anc.anon_count, 0))::BIGINT as total_picks,
        (COALESCE(ac.auth_count, 0) > 0 AND COALESCE(anc.anon_count, 0) > 0) as has_both,
        CASE 
            WHEN COALESCE(ac.auth_count, 0) > 0 AND COALESCE(anc.anon_count, 0) > 0 THEN 
                'Has both authenticated and anonymous picks'
            WHEN COALESCE(anc.anon_sets, 0) > 1 THEN 
                'Multiple anonymous pick sets (' || COALESCE(anc.anon_sets, 0) || ' sets)'
            WHEN (COALESCE(ac.auth_count, 0) + COALESCE(anc.anon_count, 0)) > 6 THEN 
                'Total picks exceed 6'
            ELSE 'Unknown issue'
        END as issue_description
    FROM auth_counts ac
    FULL OUTER JOIN anon_counts anc ON ac.user_id = anc.user_id AND ac.week = anc.week
    WHERE (COALESCE(ac.auth_count, 0) + COALESCE(anc.anon_count, 0)) > 6
       OR (COALESCE(ac.auth_count, 0) > 0 AND COALESCE(anc.anon_count, 0) > 0)
       OR COALESCE(anc.anon_sets, 0) > 1  -- Include users with multiple anonymous pick sets
    ORDER BY user_name, week;
END;
$$;

-- Create detailed analysis function for admin investigation
CREATE OR REPLACE FUNCTION public.analyze_user_pick_details(
    target_user_id UUID, 
    target_season INTEGER DEFAULT 2025,
    target_week INTEGER DEFAULT NULL
)
RETURNS TABLE(
    analysis_type TEXT,
    week_num INTEGER,
    pick_type TEXT,
    email_or_source TEXT,
    pick_count BIGINT,
    lock_count BIGINT,
    submitted BOOLEAN,
    validated TEXT,
    show_on_leaderboard BOOLEAN,
    notes TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    -- Show authenticated picks
    RETURN QUERY
    SELECT 
        'AUTHENTICATED PICKS' as analysis_type,
        p.week as week_num,
        'authenticated' as pick_type,
        'user_account' as email_or_source,
        COUNT(*)::BIGINT as pick_count,
        COUNT(CASE WHEN p.is_lock THEN 1 END)::BIGINT as lock_count,
        (COUNT(CASE WHEN p.submitted_at IS NOT NULL THEN 1 END) = COUNT(*))::BOOLEAN as submitted,
        'N/A' as validated,
        true as show_on_leaderboard,
        CASE 
            WHEN COUNT(CASE WHEN p.submitted_at IS NULL THEN 1 END) > 0 THEN 
                COUNT(CASE WHEN p.submitted_at IS NULL THEN 1 END) || ' picks not submitted'
            ELSE 'All picks submitted'
        END as notes
    FROM public.picks p
    WHERE p.user_id = target_user_id 
      AND p.season = target_season
      AND (target_week IS NULL OR p.week = target_week)
    GROUP BY p.week
    ORDER BY p.week;

    -- Show anonymous picks grouped by email/set
    RETURN QUERY
    SELECT 
        'ANONYMOUS PICKS' as analysis_type,
        ap.week as week_num,
        'anonymous' as pick_type,
        ap.email as email_or_source,
        COUNT(*)::BIGINT as pick_count,
        COUNT(CASE WHEN ap.is_lock THEN 1 END)::BIGINT as lock_count,
        true as submitted, -- Anonymous picks are always "submitted" when created
        COALESCE(ap.validation_status, 'unvalidated') as validated,
        COALESCE(ap.show_on_leaderboard, false) as show_on_leaderboard,
        CASE 
            WHEN ap.assigned_user_id IS NULL THEN 'Not assigned to user'
            WHEN ap.show_on_leaderboard = false THEN 'Hidden from leaderboard'
            WHEN ap.validation_status NOT IN ('auto_validated', 'manually_validated') THEN 'Not validated'
            ELSE 'Active on leaderboard'
        END as notes
    FROM public.anonymous_picks ap
    WHERE ap.assigned_user_id = target_user_id
      AND ap.season = target_season
      AND (target_week IS NULL OR ap.week = target_week)
    GROUP BY ap.week, ap.email, ap.validation_status, ap.show_on_leaderboard, ap.assigned_user_id
    ORDER BY ap.week, ap.email;
END;
$$;

-- Update the main duplicate picks view to use the fixed logic
CREATE OR REPLACE VIEW public.duplicate_picks_admin_view AS
WITH user_pick_analysis AS (
    -- Authenticated picks (only submitted ones)
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
    WHERE p.submitted_at IS NOT NULL  -- Only submitted picks
    
    UNION ALL
    
    -- Anonymous picks (only validated and shown on leaderboard)
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
    WHERE ap.show_on_leaderboard = true
      AND ap.validation_status IN ('auto_validated', 'manually_validated')
      AND ap.assigned_user_id IS NOT NULL
),
duplicate_scenarios AS (
    SELECT 
        user_id,
        display_name,
        season,
        week,
        MAX(CASE WHEN pick_source = 'authenticated' THEN pick_count ELSE 0 END) as authenticated_picks,
        MAX(CASE WHEN pick_source = 'authenticated' THEN lock_count ELSE 0 END) as authenticated_locks,
        MAX(CASE WHEN pick_source = 'anonymous' THEN pick_count ELSE 0 END) as anonymous_picks,
        MAX(CASE WHEN pick_source = 'anonymous' THEN lock_count ELSE 0 END) as anonymous_locks
    FROM user_pick_analysis
    GROUP BY user_id, display_name, season, week
    HAVING 
        -- Has both authenticated and anonymous picks
        (MAX(CASE WHEN pick_source = 'authenticated' THEN pick_count ELSE 0 END) > 0
         AND MAX(CASE WHEN pick_source = 'anonymous' THEN pick_count ELSE 0 END) > 0)
        OR
        -- Has more than 6 picks of any type
        (MAX(CASE WHEN pick_source = 'authenticated' THEN pick_count ELSE 0 END) > 6)
        OR
        (MAX(CASE WHEN pick_source = 'anonymous' THEN pick_count ELSE 0 END) > 6)
)
SELECT 
    ds.*,
    upp.preferred_source as admin_preference,
    upp.reasoning as admin_reasoning,
    upp.set_by_admin,
    admin_user.display_name as admin_name,
    upp.created_at as preference_set_at,
    CASE 
        WHEN upp.preferred_source IS NOT NULL THEN upp.preferred_source
        ELSE 'authenticated' -- Default to authenticated picks
    END as effective_source,
    CASE 
        WHEN upp.preferred_source IS NOT NULL THEN 'Admin Choice'
        ELSE 'Default (Authenticated)'
    END as source_reason
FROM duplicate_scenarios ds
LEFT JOIN public.user_pick_preferences upp ON 
    ds.user_id = upp.user_id 
    AND ds.season = upp.season 
    AND (upp.week IS NULL OR upp.week = ds.week)
LEFT JOIN public.users admin_user ON upp.set_by_admin = admin_user.id
ORDER BY ds.season, ds.week, ds.display_name;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_actual_duplicates_fixed(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analyze_user_pick_details(UUID, INTEGER, INTEGER) TO authenticated;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 115 COMPLETED - Fixed duplicate detection logic!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 FIXES APPLIED:';
    RAISE NOTICE '• Only count submitted authenticated picks (submitted_at IS NOT NULL)';
    RAISE NOTICE '• Only count validated anonymous picks (auto_validated/manually_validated)';
    RAISE NOTICE '• Detect multiple anonymous pick sets per user';
    RAISE NOTICE '• Updated duplicate_picks_admin_view with proper filtering';
    RAISE NOTICE '• Added detailed user analysis function for investigation';
    RAISE NOTICE '';
    RAISE NOTICE '📝 New function: check_actual_duplicates_fixed(season)';
    RAISE NOTICE '📝 New function: analyze_user_pick_details(user_id, season, week)';
END;
$$;