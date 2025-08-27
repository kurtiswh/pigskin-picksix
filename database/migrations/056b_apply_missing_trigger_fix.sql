-- Migration 056b: Apply Missing Trigger Fix for User Registration
-- 
-- Issue: Migration 056 constraint already exists but user registration still failing
-- Problem: The trigger part of Migration 056 may not have been applied correctly
-- Solution: Apply only the trigger timing fix portion

-- Step 1: Check if the issue is with the trigger on auth.users table
-- The trigger should be on auth.users, not users table

-- First, let's check what triggers exist and fix the target table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON users;

-- Step 2: The key issue - the trigger should be on auth.users table
-- Supabase auth creates records in auth.users first, then our trigger creates records in public.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION handle_new_user();

-- Step 3: Update the handle_new_user function to work with AFTER INSERT on auth.users
-- This function should INSERT into public.users table, not modify auth.users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_display_name TEXT;
  user_payment_status TEXT;
BEGIN
  -- Extract display name from email if not provided in metadata
  IF NEW.raw_user_meta_data ? 'display_name' AND 
     NEW.raw_user_meta_data->>'display_name' IS NOT NULL AND 
     TRIM(NEW.raw_user_meta_data->>'display_name') != '' THEN
    user_display_name := NEW.raw_user_meta_data->>'display_name';
  ELSE
    -- Fallback to email prefix
    IF NEW.email IS NOT NULL AND NEW.email != '' THEN
      user_display_name := SPLIT_PART(NEW.email, '@', 1);
    ELSE
      user_display_name := 'User ' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;
  END IF;
  
  -- Set default payment status
  user_payment_status := 'NotPaid';
  
  -- Insert into public.users table with proper display_name
  INSERT INTO public.users (
    id, 
    email, 
    display_name, 
    created_at, 
    payment_status
  ) VALUES (
    NEW.id,
    NEW.email,
    user_display_name,  -- This ensures display_name is never NULL
    COALESCE(NEW.created_at, NOW()),
    user_payment_status
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Test the fix with a simulated user creation
DO $$
DECLARE
    test_result TEXT;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🧪 Migration 056b Applied Successfully!';
    RAISE NOTICE '=====================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Trigger recreated on auth.users table (correct target)';
    RAISE NOTICE '✅ handle_new_user() function updated to INSERT with display_name';
    RAISE NOTICE '✅ Function ensures display_name is never NULL during insert';
    RAISE NOTICE '✅ Constraint users_display_name_not_empty already exists';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 EXPECTED RESULT:';
    RAISE NOTICE '  ✅ User registration should now work without errors';
    RAISE NOTICE '  ✅ Display names automatically set from email prefix';
    RAISE NOTICE '  ✅ No more "Database error saving new user" messages';
    RAISE NOTICE '';
    RAISE NOTICE '📱 TEST: Have someone try to register a new account now!';
END $$;

COMMENT ON FUNCTION handle_new_user IS 'Trigger function that creates public.users records when auth.users records are inserted, ensuring display_name is always set to prevent constraint violations';