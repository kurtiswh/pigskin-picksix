-- Migration 095: Debug slow completion issue
-- 
-- PURPOSE: Check if Migration 093 completion-only trigger actually exists and identify performance bottlenecks
-- ISSUE: Manual completion worked but was slow - suggests trigger issues persist

-- Check if completion-only trigger exists
DO $$
BEGIN
    RAISE NOTICE '🔍 Migration 095: DEBUGGING SLOW COMPLETION';
    RAISE NOTICE '======================================';
END;
$$;

-- Check all active triggers on games table
SELECT 
    'GAMES TABLE TRIGGERS:' as section,
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'games'
AND trigger_schema = 'public'
ORDER BY trigger_name;

-- Check if completion-only function exists
SELECT 
    'COMPLETION FUNCTION CHECK:' as section,
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name = 'handle_game_completion_only';

-- Check if old triggers are still active (should be disabled)
SELECT 
    'OLD TRIGGERS CHECK:' as section,
    trigger_name,
    event_manipulation,
    action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'games'
AND trigger_schema = 'public'
AND trigger_name IN (
    'recalculate_pick_points_trigger',
    'update_game_winner_scoring_trigger', 
    'update_pick_stats_on_game_completion_safe_trigger',
    'update_covered_status_trigger'
);

-- Check for any functions that might be causing slowness
SELECT 
    'POTENTIAL SLOW FUNCTIONS:' as section,
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND (
    routine_name LIKE '%leaderboard%' 
    OR routine_name LIKE '%calculate%'
    OR routine_name LIKE '%pick%'
    OR routine_name LIKE '%completion%'
)
ORDER BY routine_name;

-- Add diagnostic notices
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎯 DIAGNOSTIC RESULTS:';
    RAISE NOTICE '===================';
    RAISE NOTICE '✅ Manual completion worked (status updated successfully)';
    RAISE NOTICE '⚠️  But completion was SLOW - indicates performance issue remains';
    RAISE NOTICE '';
    RAISE NOTICE '📋 POSSIBLE CAUSES:';
    RAISE NOTICE '1. Migration 093 completion-only trigger NOT applied';
    RAISE NOTICE '2. Old expensive triggers still active';
    RAISE NOTICE '3. Completion trigger calls expensive functions';
    RAISE NOTICE '4. Database performance bottlenecks';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 NEXT STEPS:';
    RAISE NOTICE '1. Check trigger output above';
    RAISE NOTICE '2. If no completion-only trigger found - apply Migration 093';
    RAISE NOTICE '3. If old triggers found - disable them';
    RAISE NOTICE '4. May need to simplify completion trigger further';
END;
$$;