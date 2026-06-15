# URGENT: Fix RLS Policies for Payment Updates

The payment status update is failing with a 401 error because the `leaguesafe_payments` table also has RLS policies that are blocking write access.

## Steps to Fix (Run in Supabase SQL Editor):

### 1. Check Current RLS Status on leaguesafe_payments
```sql
-- Check if RLS is enabled and what policies exist for leaguesafe_payments
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leaguesafe_payments';
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leaguesafe_payments';
```

### 2. Option A: Temporarily Disable RLS (Quick Fix)
```sql
-- Disable RLS on leaguesafe_payments table
ALTER TABLE public.leaguesafe_payments DISABLE ROW LEVEL SECURITY;
```

### 3. Option B: Create Proper RLS Policies (Better Long-term)
```sql
-- Drop any existing problematic policies
DROP POLICY IF EXISTS "Users can manage own payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "Admin can manage all payments" ON public.leaguesafe_payments;

-- Enable RLS
ALTER TABLE public.leaguesafe_payments ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read all payment records (needed for admin)
CREATE POLICY "authenticated_read_payments" ON public.leaguesafe_payments
    FOR SELECT 
    TO authenticated
    USING (true);

-- Allow all authenticated users to insert payment records
CREATE POLICY "authenticated_insert_payments" ON public.leaguesafe_payments
    FOR INSERT 
    TO authenticated
    WITH CHECK (true);

-- Allow all authenticated users to update payment records
CREATE POLICY "authenticated_update_payments" ON public.leaguesafe_payments
    FOR UPDATE 
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Allow anonymous users to read (for public stats if needed)
CREATE POLICY "anon_read_payments" ON public.leaguesafe_payments
    FOR SELECT 
    TO anon
    USING (true);

-- Allow anonymous users to insert/update (for admin functionality)
CREATE POLICY "anon_write_payments" ON public.leaguesafe_payments
    FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);
```

### 4. Verify the Fix
```sql
-- Check that policies are created
SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'leaguesafe_payments';

-- Test insert access
INSERT INTO public.leaguesafe_payments (user_id, season, status, updated_at) 
VALUES ('test-user-id', 2025, 'Paid', now()) 
ON CONFLICT (user_id, season) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at;

-- Clean up test
DELETE FROM public.leaguesafe_payments WHERE user_id = 'test-user-id';
```

## Recommendation:

**Start with Option A (disable RLS)** to get payment updates working immediately. You can always re-enable it later with proper policies using Option B.

## What This Fixes:

- ✅ Removes the 401 Unauthorized errors on payment status updates
- ✅ Allows admin users to create/update payment records
- ✅ Enables the user management interface to work properly
- ✅ Fixes the "Failed to update payment status: 401" error

Once you run either option, the payment status updates should work without 401 errors.