-- SUPABASE PERFORMANCE DIAGNOSTICS
-- Run these queries in Supabase SQL Editor to identify performance bottlenecks
-- Execute each section separately and analyze results

-- =============================================================================
-- SECTION 1: QUERY PERFORMANCE ANALYSIS
-- =============================================================================

-- Check currently running queries and their duration
SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state,
    wait_event_type,
    wait_event
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
ORDER BY duration DESC;

-- Check slow queries from pg_stat_statements (if enabled)
SELECT 
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time,
    stddev_exec_time,
    rows
FROM pg_stat_statements 
WHERE mean_exec_time > 1000  -- queries taking more than 1 second on average
ORDER BY mean_exec_time DESC
LIMIT 20;

-- =============================================================================
-- SECTION 2: TABLE PERFORMANCE ANALYSIS  
-- =============================================================================

-- Check table sizes and row counts
SELECT 
    schemaname,
    tablename,
    attname,
    n_distinct,
    correlation
FROM pg_stats 
WHERE schemaname = 'public'
    AND tablename IN ('season_leaderboard', 'weekly_leaderboard', 'picks', 'users', 'games')
ORDER BY tablename, attname;

-- Check table and index sizes
SELECT 
    t.tablename,
    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
    pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
    pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) AS index_size,
    (SELECT count(*) FROM information_schema.columns WHERE table_name = t.tablename) as column_count
FROM pg_tables t
INNER JOIN pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
    AND t.tablename IN ('season_leaderboard', 'weekly_leaderboard', 'picks', 'users', 'games', 'leaguesafe_payments')
ORDER BY pg_total_relation_size(c.oid) DESC;

-- =============================================================================
-- SECTION 3: INDEX ANALYSIS
-- =============================================================================

-- Check existing indexes and their usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Check for missing indexes (tables with high sequential scans)
SELECT 
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_tup_ins + n_tup_upd + n_tup_del as total_writes
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
    AND seq_scan > idx_scan  -- More sequential scans than index scans
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

-- Test picks table performance (source of leaderboard data)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT 
    p.user_id,
    COUNT(*) as total_picks,
    SUM(CASE WHEN p.result = 'win' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN p.result = 'loss' THEN 1 ELSE 0 END) as losses,
    SUM(CASE WHEN p.result = 'push' THEN 1 ELSE 0 END) as pushes,
    SUM(p.points_earned) as total_points
FROM public.picks p
WHERE p.season = 2024 
    AND p.result IS NOT NULL
GROUP BY p.user_id
ORDER BY total_points DESC
LIMIT 50;

-- Test leaguesafe_payments performance (verification source)
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
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

-- Check RLS policies that might be causing performance issues
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
ORDER BY tablename, policyname;

-- Test RLS performance by temporarily disabling (BE CAREFUL - this affects security)
-- DO NOT RUN IN PRODUCTION - DIAGNOSTIC ONLY
-- ALTER TABLE public.season_leaderboard DISABLE ROW LEVEL SECURITY;
-- Test query performance here
-- ALTER TABLE public.season_leaderboard ENABLE ROW LEVEL SECURITY;

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

-- Check memory and CPU usage patterns
SELECT 
    datname,
    numbackends,
    xact_commit,
    xact_rollback,
    blks_read,
    blks_hit,
    temp_files,
    temp_bytes,
    deadlocks
FROM pg_stat_database 
WHERE datname = current_database();

-- =============================================================================
-- SECTION 7: VACUUM AND MAINTENANCE STATUS
-- =============================================================================

-- Check table maintenance status (vacuum, analyze)
SELECT 
    schemaname,
    tablename,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze,
    vacuum_count,
    autovacuum_count,
    analyze_count,
    autoanalyze_count
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY last_autoanalyze ASC NULLS FIRST;

-- Check for table bloat
SELECT 
    schemaname,
    tablename,
    n_dead_tup,
    n_live_tup,
    CASE 
        WHEN n_live_tup > 0 
        THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 2) 
        ELSE 0 
    END AS dead_tuple_percent
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
    AND (n_dead_tup > 1000 OR (n_live_tup + n_dead_tup) > 0)
ORDER BY dead_tuple_percent DESC;

-- =============================================================================
-- INSTRUCTIONS FOR ANALYSIS:
-- 
-- 1. Run Section 1 first to identify currently slow/stuck queries
-- 2. Run Section 2 to understand table sizes and structure
-- 3. Run Section 3 to check if proper indexes exist and are being used
-- 4. Run Section 4 to analyze specific leaderboard query performance
-- 5. Run Section 5 to check if RLS policies are causing slowdowns
-- 6. Run Section 6 to check connection limits and resource usage
-- 7. Run Section 7 to check if tables need maintenance (VACUUM/ANALYZE)
--
-- EXPECTED FINDINGS:
-- - High seq_scan counts indicate missing indexes
-- - High dead_tuple_percent indicates need for VACUUM
-- - Long-running queries in Section 1 indicate bottlenecks
-- - RLS policies with complex WHERE clauses cause performance issues
-- - Connection limits being hit can cause timeouts
-- =============================================================================