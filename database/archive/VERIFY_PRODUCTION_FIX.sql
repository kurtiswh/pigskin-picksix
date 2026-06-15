-- VERIFY PRODUCTION FIXES WORKED
-- Run this after applying PRODUCTION_SUPABASE_FIX.sql
-- All queries should complete in under 500ms

-- =============================================================================
-- QUICK PERFORMANCE VERIFICATION
-- =============================================================================

\timing on

-- Test 1: Basic leaderboard query
SELECT 
    user_id, 
    display_name, 
    season_rank, 
    total_points
FROM public.season_leaderboard 
WHERE season = 2024 
ORDER BY season_rank 
LIMIT 10;

-- Test 2: Verified users query (should use new index)  
SELECT 
    user_id, 
    display_name, 
    season_rank, 
    total_points
FROM public.season_leaderboard 
WHERE season = 2024 
    AND is_verified = true
ORDER BY season_rank 
LIMIT 10;

-- Test 3: Full emergency service query
SELECT 
    user_id, 
    display_name, 
    season_rank, 
    total_points, 
    total_wins, 
    total_losses, 
    total_pushes, 
    lock_wins, 
    lock_losses
FROM public.season_leaderboard 
WHERE season = 2024 
ORDER BY season_rank 
LIMIT 50;

\timing off

-- =============================================================================
-- VERIFY INDEX USAGE
-- =============================================================================

-- This should show "Index Scan using idx_season_leaderboard_season_verified"
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    user_id, 
    display_name, 
    season_rank, 
    total_points
FROM public.season_leaderboard 
WHERE season = 2024 
    AND is_verified = true
ORDER BY season_rank 
LIMIT 10;

-- =============================================================================
-- CHECK POLICIES ARE SIMPLIFIED
-- =============================================================================

SELECT 
    tablename,
    policyname,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('season_leaderboard', 'weekly_leaderboard', 'leaguesafe_payments')
ORDER BY tablename;

-- Should show policies with qual = 'true' (simplest possible)

-- =============================================================================
-- EXPECTED RESULTS:
-- =============================================================================
-- ✅ All SELECT queries complete in under 500ms
-- ✅ EXPLAIN shows "Index Scan" not "Seq Scan"  
-- ✅ Policies show qual = 'true' (no complex conditions)
-- 🎯 If all pass: Your production should now match development performance!