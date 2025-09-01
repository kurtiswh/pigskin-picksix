-- Migration 094: Verify current trigger status and identify remaining issues
-- 
-- PURPOSE: Check what triggers are currently active and identify race conditions
-- ISSUE: Still getting statement timeout (57014) when updating games to completed

-- Check all active triggers on games table
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'games'
ORDER BY trigger_name;

-- Check all active triggers on picks table (might compete for resources)
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'picks'
ORDER BY trigger_name;

-- Check all active triggers on anonymous_picks table
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'anonymous_picks'
ORDER BY trigger_name;

-- Also check for any functions that might be called
SELECT 
    routine_name,
    routine_type,
    data_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%game%' 
OR routine_name LIKE '%pick%' 
OR routine_name LIKE '%leaderboard%'
ORDER BY routine_name;

-- Add helpful notice
DO $$
BEGIN
    RAISE NOTICE '🔍 Migration 094: DIAGNOSTIC - Checking trigger status';
    RAISE NOTICE '❓ ISSUE: Still getting statement timeout (57014) on games.status update';
    RAISE NOTICE '🎯 ROOT CAUSE HYPOTHESIS: Race condition between:';
    RAISE NOTICE '   1. Live Update Service updating games.status = completed';
    RAISE NOTICE '   2. Live Update Service calling calculatePicksForGame() simultaneously';
    RAISE NOTICE '   3. Both operations competing for same database resources';
    RAISE NOTICE '🔧 EXPECTED SOLUTION: Remove pick calculation from Live Update Service';
    RAISE NOTICE '   Let completion-only trigger handle scoring after status update';
END;
$$;