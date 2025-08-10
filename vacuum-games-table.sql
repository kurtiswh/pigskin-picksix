-- Fix games table bloat by cleaning up deleted rows
-- This should dramatically improve JavaScript client performance

-- First, check current table stats
SELECT 
    'Before vacuum' as status,
    n_tup_ins as total_inserts,
    n_tup_del as total_deletes,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows,
    ROUND(n_dead_tup::float / GREATEST(n_live_tup, 1) * 100, 2) as bloat_percentage
FROM pg_stat_user_tables 
WHERE relname = 'games';

-- Vacuum the games table to clean up dead rows
VACUUM ANALYZE public.games;

-- Check stats after vacuum
SELECT 
    'After vacuum' as status,
    n_tup_ins as total_inserts,
    n_tup_del as total_deletes,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows,
    ROUND(n_dead_tup::float / GREATEST(n_live_tup, 1) * 100, 2) as bloat_percentage
FROM pg_stat_user_tables 
WHERE relname = 'games';

-- Test if queries are now fast
SELECT 'After vacuum - query test' as test, COUNT(*) as game_count FROM public.games;