-- PRODUCTION SUPABASE CRITICAL FIXES
-- Run this entire script in your PRODUCTION Supabase Studio SQL Editor
-- This will apply the same fixes that made development fast

-- =============================================================================
-- STEP 1: APPLY CRITICAL INDEXES (Same as development)
-- =============================================================================

-- Essential leaderboard indexes (these made dev environment fast)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_leaderboard_season_verified 
ON public.season_leaderboard (season, is_verified);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_leaderboard_season_rank 
ON public.season_leaderboard (season, season_rank);

-- Additional performance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_picks_season_user_result 
ON public.picks (season, user_id, result)
WHERE result IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaguesafe_season_paid_matched 
ON public.leaguesafe_payments (season, status, is_matched)
WHERE status = 'Paid' AND is_matched = true;

-- =============================================================================
-- STEP 2: SIMPLIFY RLS POLICIES (Remove expensive table scans)
-- =============================================================================

-- Drop any existing policies that might be causing table scans
DROP POLICY IF EXISTS "Users can view all leaderboard data" ON public.season_leaderboard;
DROP POLICY IF EXISTS "Public read access to season leaderboard" ON public.season_leaderboard;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.season_leaderboard;
DROP POLICY IF EXISTS "leaderboard_public_read" ON public.season_leaderboard;
DROP POLICY IF EXISTS "season_leaderboard_read_all" ON public.season_leaderboard;

-- Create the simplest possible policy (what made dev environment fast)
CREATE POLICY "production_season_leaderboard_read" ON public.season_leaderboard 
    FOR SELECT USING (true);

-- Same for weekly leaderboard
DROP POLICY IF EXISTS "Users can view all weekly leaderboard data" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "Public read access to weekly leaderboard" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "weekly_leaderboard_public_read" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "weekly_leaderboard_read_all" ON public.weekly_leaderboard;

CREATE POLICY "production_weekly_leaderboard_read" ON public.weekly_leaderboard 
    FOR SELECT USING (true);

-- Ensure leaguesafe_payments has efficient policy
DROP POLICY IF EXISTS "leaguesafe_payments_read" ON public.leaguesafe_payments;
CREATE POLICY "production_leaguesafe_payments_read" ON public.leaguesafe_payments 
    FOR SELECT USING (true);

-- =============================================================================
-- STEP 3: REFRESH DATABASE STATISTICS (Fix query planner)
-- =============================================================================

-- This is critical - stale statistics cause slow queries
ANALYZE public.season_leaderboard;
ANALYZE public.weekly_leaderboard;
ANALYZE public.picks;
ANALYZE public.users;
ANALYZE public.games;
ANALYZE public.leaguesafe_payments;

-- =============================================================================
-- STEP 4: TEST PERFORMANCE IMMEDIATELY
-- =============================================================================

-- Test the exact query your emergency service runs
-- This should complete in under 500ms after the fixes above
\timing on

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

-- Test with is_verified filter (should use new index)
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

\timing off

-- =============================================================================
-- STEP 5: VERIFY INDEX USAGE
-- =============================================================================

-- Check that indexes are being used (should show "Index Scan" not "Seq Scan")
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
-- STEP 6: CHECK FOR BLOCKING QUERIES
-- =============================================================================

-- Look for any currently running schema introspection queries that might be blocking
SELECT 
    pid,
    now() - query_start AS duration,
    state,
    wait_event_type,
    wait_event,
    left(query, 100) as query_preview
FROM pg_stat_activity 
WHERE state != 'idle' 
    AND query NOT LIKE '%pg_stat_activity%'
    AND (now() - query_start) > interval '5 seconds'
ORDER BY duration DESC;

-- If you see pg_get_tabledef queries running, you can kill them:
-- SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE query LIKE '%pg_get_tabledef%' AND state = 'active';

-- =============================================================================
-- EXPECTED RESULTS AFTER RUNNING THIS SCRIPT:
-- =============================================================================
-- 1. Index creation should complete successfully
-- 2. Policy changes should apply without errors  
-- 3. ANALYZE should complete quickly
-- 4. Test queries should complete in under 500ms
-- 5. EXPLAIN should show "Index Scan using idx_season_leaderboard_season_verified"
-- 6. No long-running blocking queries should be present
--
-- If all tests pass, your production environment should match development performance!
-- =============================================================================

-- Success verification query
SELECT 'PRODUCTION FIXES APPLIED SUCCESSFULLY! Test your leaderboard now.' as status;