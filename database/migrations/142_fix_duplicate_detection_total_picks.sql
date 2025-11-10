-- Migration 142: Fix Duplicate Pick Detection - Total Picks Logic
--
-- PROBLEM: duplicate_picks_admin_view doesn't flag users when authenticated + anonymous picks > 6
-- EXAMPLE: User with 4 authenticated + 3 anonymous = 7 total is NOT flagged (should be!)
--
-- ROOT CAUSE: HAVING clause only checks:
--   - Has both (any amount) OR
--   - Has >6 in one table
--   But doesn't check if TOTAL picks > 6
--
-- FIX: Update HAVING clause to check total picks

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 142: Fix Duplicate Detection Total Picks Logic';
    RAISE NOTICE '===============================================================';
    RAISE NOTICE 'GOAL: Flag users when authenticated + anonymous picks > 6';
    RAISE NOTICE '';
END;
$$;

-- Drop existing view
DROP VIEW IF EXISTS public.duplicate_picks_admin_view;

-- Recreate with corrected logic
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
        -- FIXED LOGIC: Flag if total picks exceed 6 (this was missing!)
        ((MAX(CASE WHEN pick_source = 'authenticated' THEN pick_count ELSE 0 END) +
          MAX(CASE WHEN pick_source = 'anonymous' THEN pick_count ELSE 0 END)) > 6)
        OR
        -- Also flag if user has BOTH authenticated and anonymous picks
        -- (even if total ≤ 6, admin needs to choose which set to use)
        (MAX(CASE WHEN pick_source = 'authenticated' THEN pick_count ELSE 0 END) > 0
         AND MAX(CASE WHEN pick_source = 'anonymous' THEN pick_count ELSE 0 END) > 0)
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
        WHEN upp.preferred_source IS NOT NULL THEN
            'Admin Choice: ' || upp.preferred_source
        WHEN (ds.authenticated_picks + ds.anonymous_picks) > 6 THEN
            'Total picks > 6 (Using authenticated by default)'
        ELSE
            'Has both sources (Using authenticated by default)'
    END as source_reason
FROM duplicate_scenarios ds
LEFT JOIN public.user_pick_preferences upp ON
    ds.user_id = upp.user_id
    AND ds.season = upp.season
    AND (upp.week IS NULL OR upp.week = ds.week)
LEFT JOIN public.users admin_user ON upp.set_by_admin = admin_user.id
ORDER BY ds.season, ds.week, ds.display_name;

-- Verification tests
DO $$
DECLARE
    test_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 142 COMPLETED - Fixed total picks detection!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 CHANGES MADE:';
    RAISE NOTICE '• Updated HAVING clause to check (authenticated + anonymous) > 6';
    RAISE NOTICE '• Now correctly flags users with split picks that total > 6';
    RAISE NOTICE '• Improved source_reason to show WHY user is flagged';
    RAISE NOTICE '';

    -- Test that the view exists
    SELECT COUNT(*) INTO test_count
    FROM information_schema.views
    WHERE table_schema = 'public'
      AND table_name = 'duplicate_picks_admin_view';

    IF test_count = 1 THEN
        RAISE NOTICE '✅ duplicate_picks_admin_view recreated successfully';
    ELSE
        RAISE WARNING '⚠️  View not found - check for errors';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '📝 DETECTION CRITERIA (UPDATED):';
    RAISE NOTICE '1. User has (authenticated + anonymous) > 6 picks ← FIXED!';
    RAISE NOTICE '2. User has picks in BOTH tables (any amount)';
    RAISE NOTICE '';
    RAISE NOTICE '📊 TESTING:';
    RAISE NOTICE 'In Admin Panel → Duplicate Picks:';
    RAISE NOTICE '• Click "Debug Analysis" to verify correct detection';
    RAISE NOTICE '• Main view should now match debug function results';
    RAISE NOTICE '';
END;
$$;

-- ============================================================================
-- EXAMPLES OF WHAT GETS FLAGGED NOW
-- ============================================================================
--
-- Authenticated | Anonymous | Total | Flagged? | Reason
-- --------------|-----------|-------|----------|---------------------------
-- 6             | 0         | 6     | NO       | Within limit
-- 7             | 0         | 7     | YES      | Total > 6
-- 0             | 7         | 7     | YES      | Total > 6
-- 4             | 3         | 7     | YES      | Total > 6 (NOW DETECTED!)
-- 5             | 2         | 7     | YES      | Total > 6 (NOW DETECTED!)
-- 3             | 2         | 5     | YES      | Has both sources
-- 6             | 1         | 7     | YES      | Both criteria
--
-- ============================================================================
