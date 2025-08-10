-- Simple tests to isolate games table issue
-- Run these one by one to see where it breaks

-- Test 1: Simple count (should be instant)
SELECT 'Test 1 - Simple count' as test, COUNT(*) as count FROM public.games;

-- Test 2: Select first few rows (should be instant)  
SELECT 'Test 2 - First 5 rows' as test, id, home_team, away_team, week, season FROM public.games LIMIT 5;

-- Test 3: Try the exact query pattern used by JavaScript client
SELECT 'Test 3 - Week filter' as test, COUNT(*) as count FROM public.games WHERE week = 1 AND season = 2025;

-- Test 4: Check if it's a specific column causing issues
SELECT 'Test 4 - Minimal columns' as test, id, week, season FROM public.games LIMIT 1;

-- Test 5: Check table stats to see if there's corruption
SELECT 
    'Test 5 - Table stats' as test,
    schemaname,
    tablename,
    n_tup_ins,
    n_tup_upd, 
    n_tup_del,
    n_live_tup,
    n_dead_tup
FROM pg_stat_user_tables 
WHERE relname = 'games';