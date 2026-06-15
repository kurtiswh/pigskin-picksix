# URGENT: Complete RLS Fix (Version 2)

The 401 Unauthorized error confirms that RLS policies are still blocking access to the users table. Here's a comprehensive fix:

## Steps to Fix (Run in Supabase SQL Editor):

### 1. Check Current RLS Status
```sql
-- Check if RLS is enabled and what policies exist
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'users';
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';
```

### 2. Temporarily Disable RLS (Quick Fix)
```sql
-- This will immediately fix the 401 error
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
```

### 3. Alternative: Create Proper Policies (Better Long-term)
If you prefer to keep RLS enabled with proper policies:

```sql
-- First drop ALL existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "authenticated_users_select_all" ON public.users;
DROP POLICY IF EXISTS "allow_select_users" ON public.users;
DROP POLICY IF EXISTS "Anyone can view users" ON public.users;
DROP POLICY IF EXISTS "authenticated_read_users" ON public.users;
DROP POLICY IF EXISTS "anon_read_users" ON public.users;

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Create a simple, permissive policy for reading
CREATE POLICY "allow_all_select" ON public.users
    FOR SELECT 
    USING (true);

-- Create a policy for authenticated users to update their own records
CREATE POLICY "users_update_own" ON public.users
    FOR UPDATE 
    TO authenticated
    USING (auth.uid() = id);

-- Create a policy for inserting new users
CREATE POLICY "users_insert" ON public.users
    FOR INSERT 
    TO authenticated
    WITH CHECK (true);
```

### 4. Verify the Fix
```sql
-- Check that policies are created
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users';

-- Test access directly
SELECT id, email, display_name FROM public.users LIMIT 5;
```

## Recommendation:

**Start with Step 2 (disable RLS)** to get the app working immediately. You can always re-enable it later with proper policies.

## What Each Approach Does:

- **Option 2 (Disable RLS)**: Turns off all access restrictions - app will work immediately
- **Option 3 (Proper Policies)**: Keeps security but allows necessary access patterns

Once you run either Step 2 or Step 3, the 401 errors should disappear and your real user profile should load.