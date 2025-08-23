-- CRITICAL SUPABASE PERFORMANCE FIX
-- Based on diagnostic results showing the root cause

-- =============================================================================
-- ROOT CAUSE IDENTIFIED:
-- =============================================================================
-- Your pg_stat_statements shows the real problem:
-- - pg_get_tabledef() queries taking 1000-1200ms EACH
-- - These are Supabase Studio/Dashboard queries for schema introspection
-- - 20+ of these queries running simultaneously = 20+ seconds total
-- - This is what's causing your timeouts!

-- =============================================================================
-- IMMEDIATE ACTIONS TO TAKE:
-- =============================================================================

-- 1. STOP using Supabase Studio/Dashboard while users are active
--    - The schema introspection queries are blocking your application
--    - Each pg_get_tabledef() call takes 1+ seconds

-- 2. Apply these critical indexes NOW (run in SQL Editor):

-- Essential leaderboard indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_leaderboard_season_verified 
ON public.season_leaderboard (season, is_verified);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_leaderboard_season_rank 
ON public.season_leaderboard (season, season_rank);

-- Fix table statistics (your tables show mismatched sizes - sign of statistics issues)
ANALYZE public.season_leaderboard;
ANALYZE public.weekly_leaderboard;
ANALYZE public.picks;
ANALYZE public.users;
ANALYZE public.leaguesafe_payments;

-- =============================================================================
-- CORRECTED DIAGNOSTIC QUERIES (fixing the column error):
-- =============================================================================

-- Check for missing indexes (corrected query)
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
    AND relname IN ('season_leaderboard', 'weekly_leaderboard', 'picks', 'users', 'games', 'leaguesafe_payments')
    AND seq_scan > COALESCE(idx_scan, 0)  -- More sequential scans than index scans
ORDER BY seq_scan DESC;

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

-- Test your exact leaderboard query performance
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
    lock_losses
FROM public.season_leaderboard 
WHERE season = 2024 
    AND is_verified = true
ORDER BY season_rank 
LIMIT 50;

-- =============================================================================
-- OPTIMIZED RLS POLICIES (Apply these):
-- =============================================================================

-- Drop existing policies that might be causing table scans
DROP POLICY IF EXISTS "Users can view all leaderboard data" ON public.season_leaderboard;
DROP POLICY IF EXISTS "Public read access to season leaderboard" ON public.season_leaderboard;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.season_leaderboard;
DROP POLICY IF EXISTS "leaderboard_public_read" ON public.season_leaderboard;

-- Create the simplest possible policy
CREATE POLICY "season_leaderboard_read_all" ON public.season_leaderboard 
    FOR SELECT USING (true);

-- Same for weekly leaderboard
DROP POLICY IF EXISTS "Users can view all weekly leaderboard data" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "Public read access to weekly leaderboard" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "weekly_leaderboard_public_read" ON public.weekly_leaderboard;

CREATE POLICY "weekly_leaderboard_read_all" ON public.weekly_leaderboard 
    FOR SELECT USING (true);

-- =============================================================================
-- EMERGENCY ACTIONS FOR IMMEDIATE RELIEF:
-- =============================================================================

-- 1. Kill any running pg_get_tabledef queries (if you see them in current activity)
-- SELECT pg_cancel_backend(pid) FROM pg_stat_activity 
-- WHERE query LIKE '%pg_get_tabledef%' AND state = 'active';

-- 2. Check current activity to see what's blocking
SELECT 
    pid,
    now() - query_start AS duration,
    state,
    wait_event_type,
    wait_event,
    left(query, 100) as query_start
FROM pg_stat_activity 
WHERE state != 'idle' 
    AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;

-- =============================================================================
-- VERIFICATION QUERIES (run after fixes):
-- =============================================================================

-- Test leaderboard performance after fixes
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

-- Verify indexes are being used
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
-- SUMMARY OF THE REAL PROBLEM:
-- =============================================================================
-- Your diagnostic results show:
-- 1. pg_get_tabledef queries from Supabase Studio taking 1+ seconds each
-- 2. 20+ of these running = blocking your database
-- 3. Your leaderboard queries are fine, but they can't run due to blocking
-- 
-- SOLUTION:
-- 1. Stop using Supabase Studio during active usage
-- 2. Add the critical indexes above
-- 3. Simplify RLS policies
-- 4. Your emergency service should work immediately after this
-- =============================================================================