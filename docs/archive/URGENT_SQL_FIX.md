# URGENT: SQL Commands to Fix Database Access

The app is currently broken because the users table has RLS (Row Level Security) policies that are blocking access. You need to run these SQL commands in your Supabase dashboard.

## Steps to Fix:

1. Go to your Supabase dashboard: https://supabase.com/dashboard/projects
2. Select your project: `zgdaqbnpgrabbnljmiqy`
3. Go to the "SQL Editor" tab
4. Run these commands **in order**:

### 1. Check Current Status
```sql
-- Check current RLS status and policies
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users';
SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';
```

### 2. Drop All Existing Problematic Policies
```sql
-- Drop all existing policies that are causing 401 errors
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "authenticated_users_select_all" ON public.users;
DROP POLICY IF EXISTS "allow_select_users" ON public.users;
DROP POLICY IF EXISTS "Anyone can view users" ON public.users;
```

### 3. Create Working Policies
```sql
-- Create a simple policy that allows authenticated users to read all user profiles
CREATE POLICY "authenticated_read_users" ON public.users
    FOR SELECT 
    TO authenticated
    USING (true);

-- Also ensure anon role can read (for initial app functionality)  
CREATE POLICY "anon_read_users" ON public.users
    FOR SELECT 
    TO anon
    USING (true);
```

### 4. Verify the Fix
```sql
-- Verify the policies were created
SELECT policyname, cmd, roles, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';
```

## Alternative: Temporary Fix

If the above doesn't work, you can temporarily disable RLS entirely:

```sql
-- Temporarily disable RLS (NOT recommended for production)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
```

## What This Fixes:

- ✅ Removes the 401 Unauthorized errors on the users table
- ✅ Allows the authentication flow to work properly
- ✅ Enables the user management page to load real data
- ✅ Fixes the API tests that were timing out

Once you run these commands, the application should work normally again.