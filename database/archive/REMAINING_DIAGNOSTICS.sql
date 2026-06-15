-- REMAINING DIAGNOSTICS - Run these to verify performance fixes worked
-- Copy each section separately into Supabase SQL Editor

-- =============================================================================
-- SECTION 3: INDEX ANALYSIS (CORRECTED)
-- =============================================================================

-- Check existing indexes and their usage
SELECT 
    schemaname,
    relname as tablename,
    indexrelname as indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
    AND relname IN ('season_leaderboard', 'weekly_leaderboard', 'picks', 'leaguesafe_payments')
ORDER BY idx_scan DESC;

-- Check for missing indexes (tables with high sequential scans)
SELECT 
    schemaname,
    relname as tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_tup_ins + n_tup_upd + n_tup_del as total_writes
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
    AND relname IN ('season_leaderboard', 'weekly_leaderboard', 'picks', 'leaguesafe_payments')
    AND seq_scan > COALESCE(idx_scan, 0)  -- More sequential scans than index scans
ORDER BY seq_scan DESC;

-- =============================================================================
-- SECTION 4: LEADERBOARD-SPECIFIC PERFORMANCE
-- =============================================================================

-- Test season_leaderboard performance with EXPLAIN ANALYZE
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT 
    user_id, 
    display_name, 
    season_rank, 
    total_points, 
    total_wins, 
    total_losses, 
    total_pushes, 
    lock_wins, 
    lock_losses,
    is_verified
FROM public.season_leaderboard 
WHERE season = 2024 
    AND is_verified = true
ORDER BY season_rank 
LIMIT 50;

-- Test basic season_leaderboard query (what your app actually runs)
EXPLAIN (ANALYZE, BUFFERS)
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

-- Test leaguesafe_payments verification queries
EXPLAIN (ANALYZE, BUFFERS)
SELECT 
    user_id, 
    leaguesafe_owner_name,
    status,
    is_matched
FROM public.leaguesafe_payments 
WHERE season = 2024 
    AND status = 'Paid' 
    AND is_matched = true;

-- =============================================================================
-- SECTION 5: RLS POLICY PERFORMANCE ANALYSIS
-- =============================================================================

-- Check current RLS policies - should be simple now
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('season_leaderboard', 'weekly_leaderboard', 'leaguesafe_payments')
ORDER BY tablename, policyname;

-- =============================================================================
-- SECTION 6: CONNECTION AND RESOURCE USAGE
-- =============================================================================

-- Check active connections
SELECT 
    state,
    count(*) as connections
FROM pg_stat_activity 
GROUP BY state
ORDER BY connections DESC;

-- Check connection limits
SELECT 
    setting as max_connections,
    (SELECT count(*) FROM pg_stat_activity) as current_connections,
    (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections
FROM pg_settings 
WHERE name = 'max_connections';

-- Check for any currently slow queries
SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state,
    wait_event_type,
    wait_event
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '2 seconds'
    AND state != 'idle'
    AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;

-- =============================================================================
-- QUICK PERFORMANCE TEST
-- =============================================================================

-- Time a simple leaderboard query to verify speed
\timing on
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
-- EXPECTED RESULTS AFTER FIXES:
-- =============================================================================
-- Section 3: Should show idx_season_leaderboard_season_verified being used
-- Section 4: EXPLAIN ANALYZE should show "Index Scan" instead of "Seq Scan"
--           Query should complete in under 100ms
-- Section 5: Should show simple policies with "qual" = "true"  
-- Section 6: Should show no long-running queries
-- Performance test: Should complete in under 50ms
-- =============================================================================