-- Check table permissions and ownership
-- This will help us understand why anon role can't access users table

-- Check table ownership and permissions
SELECT 
    schemaname,
    tablename,
    tableowner,
    hasinsert,
    hasselect,
    hasupdate,
    hasdelete
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'games', 'week_settings')
ORDER BY tablename;

-- Check specific role permissions on tables
SELECT 
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'games', 'week_settings')
AND grantee IN ('anon', 'authenticated', 'public')
ORDER BY table_name, grantee;

-- Check if users table exists and is accessible
SELECT 'users table info:' as info;
SELECT count(*) as user_count FROM public.users;

-- Check RLS status for all tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'games', 'week_settings')
ORDER BY tablename;