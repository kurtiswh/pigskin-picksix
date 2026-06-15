-- LEADERBOARD DIAGNOSTICS - Run these in Supabase SQL Editor to identify the issue
-- Run each section separately and check results

-- =============================================================================
-- SECTION 1: DATABASE STRUCTURE DIAGNOSTICS
-- =============================================================================

-- Check if season_leaderboard exists and what type it is (TABLE vs VIEW)
SELECT 
    table_name,
    table_type,
    table_schema
FROM information_schema.tables 
WHERE table_name = 'season_leaderboard' AND table_schema = 'public';

-- Check column structure of season_leaderboard
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'season_leaderboard' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check if weekly_leaderboard exists too
SELECT 
    table_name,
    table_type,
    table_schema
FROM information_schema.tables 
WHERE table_name = 'weekly_leaderboard' AND table_schema = 'public';

-- =============================================================================
-- SECTION 2: DATA EXISTENCE CHECK
-- =============================================================================

-- Check if season_leaderboard has any data at all
SELECT COUNT(*) as total_rows FROM public.season_leaderboard;

-- Check data by season
SELECT 
    season,
    COUNT(*) as row_count
FROM public.season_leaderboard 
GROUP BY season 
ORDER BY season;

-- Check 2024 data specifically  
SELECT COUNT(*) as season_2024_rows FROM public.season_leaderboard WHERE season = 2024;

-- Sample a few rows to see data structure
SELECT * FROM public.season_leaderboard LIMIT 5;

-- =============================================================================
-- SECTION 3: DIRECT QUERY TEST (What our app is trying to run)
-- =============================================================================

-- Test the exact query our simple service runs
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
LIMIT 10;

-- =============================================================================
-- SECTION 4: UNDERLYING DATA CHECK (picks table)
-- =============================================================================

-- Check if picks table has data for 2024
SELECT 
    season,
    COUNT(*) as total_picks,
    COUNT(*) FILTER (WHERE result IS NOT NULL) as picks_with_results,
    COUNT(DISTINCT user_id) as unique_users
FROM public.picks 
WHERE season IN (2023, 2024)
GROUP BY season 
ORDER BY season;

-- Check recent picks to see data quality
SELECT 
    user_id,
    week,
    season,
    result,
    points_earned,
    is_lock
FROM public.picks 
WHERE season = 2024 
    AND result IS NOT NULL
ORDER BY week DESC 
LIMIT 10;

-- =============================================================================
-- SECTION 5: USER TABLE CHECK
-- =============================================================================

-- Check users table structure and sample data
SELECT COUNT(*) as total_users FROM public.users;
SELECT id, display_name FROM public.users LIMIT 5;

-- =============================================================================
-- SECTION 6: RLS POLICY CHECK
-- =============================================================================

-- Check current RLS policies on season_leaderboard
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'season_leaderboard';

-- =============================================================================
-- INSTRUCTIONS:
-- 
-- Run each section and note the results:
-- 
-- 1. If SECTION 1 shows table_type = 'VIEW': The database still has VIEWs, not TABLEs
-- 2. If SECTION 2 shows 0 rows: The tables exist but are empty 
-- 3. If SECTION 3 fails: Column mismatch or permissions issue
-- 4. If SECTION 4 shows no picks_with_results: No calculated results exist
-- 5. If SECTION 6 shows no policies: RLS might be blocking access
-- 
-- Based on results, we can create the appropriate fix.
-- =============================================================================