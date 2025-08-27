-- Migration 057 (Simplified Version): Fix User Registration Database Error
-- 
-- Problem: Users getting "Database error saving new user" during registration
-- Root Cause: Constraint/trigger timing issues with payment_status field
-- Solution: Fix constraints and enhance trigger function

-- Step 1: Fix the payment_status constraint
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'users_payment_status_check' 
    AND table_name = 'users'
  ) THEN
    ALTER TABLE public.users DROP CONSTRAINT users_payment_status_check;
    RAISE NOTICE 'Dropped existing payment_status constraint';
  END IF;
  
  -- Add the corrected CHECK constraint with all valid values
  ALTER TABLE public.users 
  ADD CONSTRAINT users_payment_status_check 
  CHECK (payment_status IN ('Paid', 'NotPaid', 'Pending', 'No Payment', 'Manual Registration'));
  
  RAISE NOTICE 'Added payment_status CHECK constraint with all valid values';
END $$;

-- Step 2: Ensure payment_status column exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' 
    AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE public.users 
    ADD COLUMN payment_status TEXT DEFAULT 'NotPaid';
    RAISE NOTICE 'Added missing payment_status column';
  ELSE
    RAISE NOTICE 'payment_status column already exists';
  END IF;
END $$;

-- Step 3: Fix the handle_new_user trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_display_name TEXT;
  user_payment_status TEXT;
BEGIN
  -- Extract display name from metadata or email
  IF NEW.raw_user_meta_data ? 'display_name' AND 
     NEW.raw_user_meta_data->>'display_name' IS NOT NULL AND 
     TRIM(NEW.raw_user_meta_data->>'display_name') != '' THEN
    user_display_name := TRIM(NEW.raw_user_meta_data->>'display_name');
  ELSIF NEW.email IS NOT NULL AND NEW.email != '' THEN
    user_display_name := SPLIT_PART(NEW.email, '@', 1);
  ELSE
    user_display_name := 'User ' || SUBSTRING(NEW.id::TEXT, 1, 8);
  END IF;
  
  -- Ensure display_name is not empty
  IF user_display_name IS NULL OR TRIM(user_display_name) = '' THEN
    user_display_name := 'User ' || SUBSTRING(NEW.id::TEXT, 1, 8);
  END IF;
  
  -- Set payment status to valid value
  user_payment_status := 'NotPaid';
  
  -- Insert into public.users table
  BEGIN
    INSERT INTO public.users (
      id, 
      email, 
      display_name, 
      created_at, 
      payment_status,
      is_admin
    ) VALUES (
      NEW.id,
      NEW.email,
      user_display_name,
      COALESCE(NEW.created_at, NOW()),
      user_payment_status,
      FALSE
    );
  EXCEPTION 
    WHEN unique_violation THEN
      -- User already exists - don't fail
      RAISE NOTICE 'User % already exists', NEW.email;
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Failed to create user profile: % %', SQLSTATE, SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- Step 5: Add comments
COMMENT ON FUNCTION public.handle_new_user IS 'Fixed trigger function for user registration - handles payment_status properly';
COMMENT ON CONSTRAINT users_payment_status_check ON public.users IS 'CHECK constraint for valid payment_status values';

-- Final message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '===================================';
  RAISE NOTICE 'MIGRATION 057 APPLIED SUCCESSFULLY';
  RAISE NOTICE '===================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Fixed:';
  RAISE NOTICE '  - payment_status CHECK constraint';
  RAISE NOTICE '  - handle_new_user() trigger function';
  RAISE NOTICE '  - User registration error handling';
  RAISE NOTICE '';
  RAISE NOTICE 'Users should now be able to register without database errors.';
  RAISE NOTICE '';
END $$;