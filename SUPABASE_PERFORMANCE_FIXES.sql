-- SUPABASE PERFORMANCE FIXES
-- Apply these optimizations based on diagnostic results
-- Run each section individually and test performance after each

-- =============================================================================
-- SECTION 1: CRITICAL INDEXES FOR LEADERBOARD PERFORMANCE
-- =============================================================================

-- Composite index for season_leaderboard queries (if it's a table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_leaderboard_season_verified_rank 
ON public.season_leaderboard (season, is_verified, season_rank)
WHERE is_verified = true;

-- Index for season filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_season_leaderboard_season 
ON public.season_leaderboard (season);

-- Composite index for picks table (source data)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_picks_season_user_result 
ON public.picks (season, user_id, result)
WHERE result IS NOT NULL;

-- Index for picks aggregation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_picks_season_result_points 
ON public.picks (season, result, points_earned)
WHERE result IS NOT NULL AND points_earned IS NOT NULL;

-- Index for leaguesafe_payments verification queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leaguesafe_season_paid_matched 
ON public.leaguesafe_payments (season, status, is_matched)
WHERE status = 'Paid' AND is_matched = true;

-- =============================================================================
-- SECTION 2: OPTIMIZED RLS POLICIES (Replace existing ones)
-- =============================================================================

-- Drop existing policies that might be causing performance issues
DROP POLICY IF EXISTS "Users can view all leaderboard data" ON public.season_leaderboard;
DROP POLICY IF EXISTS "Public read access to season leaderboard" ON public.season_leaderboard;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.season_leaderboard;

-- Create simple, performant RLS policy
CREATE POLICY "leaderboard_public_read" ON public.season_leaderboard 
    FOR SELECT USING (true);

-- Apply same optimization to weekly_leaderboard if it exists
DROP POLICY IF EXISTS "Users can view all weekly leaderboard data" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "Public read access to weekly leaderboard" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.weekly_leaderboard;

CREATE POLICY "weekly_leaderboard_public_read" ON public.weekly_leaderboard 
    FOR SELECT USING (true);

-- Ensure leaguesafe_payments has efficient policy
DROP POLICY IF EXISTS "leaguesafe_payments_read" ON public.leaguesafe_payments;
CREATE POLICY "leaguesafe_payments_read" ON public.leaguesafe_payments 
    FOR SELECT USING (true);

-- =============================================================================
-- SECTION 3: DATABASE MAINTENANCE (Run during low traffic)
-- =============================================================================

-- Analyze tables to update statistics
ANALYZE public.season_leaderboard;
ANALYZE public.weekly_leaderboard;
ANALYZE public.picks;
ANALYZE public.users;
ANALYZE public.games;
ANALYZE public.leaguesafe_payments;

-- Vacuum tables to reclaim space (only if high dead tuple percentage)
-- VACUUM (ANALYZE, VERBOSE) public.picks;
-- VACUUM (ANALYZE, VERBOSE) public.season_leaderboard;

-- =============================================================================
-- SECTION 4: CONNECTION POOL OPTIMIZATION SETTINGS
-- =============================================================================

-- Check current connection settings
SELECT name, setting, unit, category 
FROM pg_settings 
WHERE name IN ('max_connections', 'shared_buffers', 'work_mem', 'maintenance_work_mem');

-- Recommend settings for Supabase (these may need to be set via Supabase dashboard):
-- max_connections: 100-200 (depending on plan)
-- shared_buffers: 25% of available RAM
-- work_mem: 4MB-16MB (for complex queries)
-- maintenance_work_mem: 64MB-256MB (for index creation/maintenance)

-- =============================================================================
-- SECTION 5: QUERY OPTIMIZATION WITH MATERIALIZED VIEW (Advanced)
-- =============================================================================

-- If season_leaderboard is currently a VIEW causing performance issues,
-- consider creating a MATERIALIZED VIEW instead

-- Step 1: Create materialized view for better performance
CREATE MATERIALIZED VIEW IF NOT EXISTS public.season_leaderboard_materialized AS
SELECT 
    u.id as user_id,
    u.display_name,
    p_stats.season,
    RANK() OVER (PARTITION BY p_stats.season ORDER BY p_stats.total_points DESC) as season_rank,
    COALESCE(p_stats.total_points, 0) as total_points,
    COALESCE(p_stats.total_wins, 0) as total_wins,
    COALESCE(p_stats.total_losses, 0) as total_losses,
    COALESCE(p_stats.total_pushes, 0) as total_pushes,
    COALESCE(p_stats.lock_wins, 0) as lock_wins,
    COALESCE(p_stats.lock_losses, 0) as lock_losses,
    COALESCE(p_stats.total_picks, 0) as total_picks,
    CASE 
        WHEN ls.user_id IS NOT NULL THEN true 
        ELSE false 
    END as is_verified,
    CASE 
        WHEN ls.status = 'Paid' THEN 'Paid'
        WHEN ls.status IS NOT NULL THEN ls.status
        ELSE 'Not Paid'
    END as payment_status
FROM public.users u
LEFT JOIN (
    SELECT 
        user_id,
        season,
        COUNT(*) as total_picks,
        SUM(CASE WHEN result = 'win' THEN 1 ELSE 0 END) as total_wins,
        SUM(CASE WHEN result = 'loss' THEN 1 ELSE 0 END) as total_losses,
        SUM(CASE WHEN result = 'push' THEN 1 ELSE 0 END) as total_pushes,
        SUM(CASE WHEN result = 'win' AND is_lock THEN 1 ELSE 0 END) as lock_wins,
        SUM(CASE WHEN result = 'loss' AND is_lock THEN 1 ELSE 0 END) as lock_losses,
        SUM(COALESCE(points_earned, 0)) as total_points
    FROM public.picks
    WHERE result IS NOT NULL
    GROUP BY user_id, season
) p_stats ON u.id = p_stats.user_id
LEFT JOIN public.leaguesafe_payments ls ON u.id = ls.user_id 
    AND ls.season = p_stats.season
    AND ls.is_matched = true
WHERE p_stats.season IS NOT NULL;

-- Create indexes on the materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_season_leaderboard_mat_user_season 
ON public.season_leaderboard_materialized (user_id, season);

CREATE INDEX IF NOT EXISTS idx_season_leaderboard_mat_season_rank 
ON public.season_leaderboard_materialized (season, season_rank);

CREATE INDEX IF NOT EXISTS idx_season_leaderboard_mat_season_verified 
ON public.season_leaderboard_materialized (season, is_verified, season_rank)
WHERE is_verified = true;

-- Create function to refresh the materialized view
CREATE OR REPLACE FUNCTION refresh_season_leaderboard()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.season_leaderboard_materialized;
END;
$$;

-- Grant access to the materialized view
GRANT SELECT ON public.season_leaderboard_materialized TO anon;
GRANT SELECT ON public.season_leaderboard_materialized TO authenticated;

-- Enable RLS on materialized view
ALTER TABLE public.season_leaderboard_materialized ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mat_leaderboard_read" ON public.season_leaderboard_materialized 
    FOR SELECT USING (true);

-- =============================================================================
-- SECTION 6: PERFORMANCE MONITORING QUERIES
-- =============================================================================

-- Query to check index usage after optimization
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
    AND tablename IN ('season_leaderboard', 'picks', 'leaguesafe_payments')
ORDER BY idx_scan DESC;

-- Query to verify RLS policies are simple
SELECT 
    tablename,
    policyname,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('season_leaderboard', 'weekly_leaderboard', 'leaguesafe_payments');

-- =============================================================================
-- INSTRUCTIONS:
-- 
-- 1. FIRST: Run the diagnostic script to identify specific issues
-- 2. Apply Section 1 (indexes) - these are safe and will help immediately
-- 3. Apply Section 2 (RLS policies) - test thoroughly after applying
-- 4. Run Section 3 (maintenance) during low traffic periods
-- 5. Section 5 (materialized view) is advanced - only if standard table is too slow
-- 6. Monitor performance with Section 6 queries
--
-- ROLLBACK PLAN:
-- If performance gets worse, you can:
-- - Drop the new indexes: DROP INDEX idx_name;
-- - Restore old RLS policies from your backup
-- - Skip materialized view approach
-- =============================================================================

-- Test query after optimizations
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