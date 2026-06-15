-- Check RLS policies for key tables
SELECT 
    schemaname, 
    tablename, 
    rowsecurity,
    (SELECT count(*) FROM pg_policies WHERE schemaname = t.schemaname AND tablename = t.tablename) as policy_count
FROM pg_tables t 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'games', 'picks', 'week_settings')
ORDER BY tablename;

-- Show specific policies
SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    roles,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'games', 'picks', 'week_settings')
ORDER BY tablename, policyname;