-- Fix: Re-enable the user creation trigger that was disabled in migration 015
-- This is necessary for RLS policies to work because they depend on users existing in public.users

-- Re-create the trigger to automatically create user records when auth users are created
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Also manually create any missing user records for existing auth users
-- (This handles the case where users authenticated while the trigger was disabled)
INSERT INTO public.users (id, email, display_name, is_admin)
SELECT 
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'display_name', split_part(au.email, '@', 1)) as display_name,
    CASE 
        WHEN au.email LIKE '%+testadmin%' OR au.email LIKE '%+admin%' THEN true
        ELSE false
    END as is_admin
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE pu.id IS NULL  -- Only insert missing users
ON CONFLICT (email) DO UPDATE SET
    id = EXCLUDED.id,  -- Update the ID to match auth.users
    display_name = COALESCE(EXCLUDED.display_name, public.users.display_name),
    is_admin = EXCLUDED.is_admin;

-- Verify the fix
SELECT 
    'auth.users' as table_name, 
    count(*) as count 
FROM auth.users
UNION ALL
SELECT 
    'public.users' as table_name, 
    count(*) as count 
FROM public.users;