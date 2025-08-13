-- Check table permissions (fixed version)

-- Check table ownership
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'games', 'week_settings')
ORDER BY tablename;

-- Check role permissions on tables
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'games', 'week_settings')
ORDER BY table_name, grantee;

-- Check if tables exist and count rows
SELECT 'Table row counts:' as info;
SELECT 'users' as table_name, count(*) as row_count FROM public.users
UNION ALL
SELECT 'games' as table_name, count(*) as row_count FROM public.games
UNION ALL  
SELECT 'week_settings' as table_name, count(*) as row_count FROM public.week_settings;

-- Check current database and role
SELECT current_database(), current_user, session_user;