-- Migration 053: Fix User Profile Data Consistency
-- Purpose: Ensure all users have proper display_name field to prevent pick submission 400 errors
-- Issue: Some users have NULL or empty display_name causing "record has no field display_name" errors

-- Check current state of user display names
DO $$
DECLARE
    null_count INTEGER;
    empty_count INTEGER;
    total_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM users;
    SELECT COUNT(*) INTO null_count FROM users WHERE display_name IS NULL;
    SELECT COUNT(*) INTO empty_count FROM users WHERE display_name = '' OR TRIM(display_name) = '';
    
    RAISE NOTICE 'User Profile Data Consistency Check:';
    RAISE NOTICE '  Total users: %', total_count;
    RAISE NOTICE '  Users with NULL display_name: %', null_count;
    RAISE NOTICE '  Users with empty display_name: %', empty_count;
    RAISE NOTICE '  Users needing fixes: %', null_count + empty_count;
END $$;

-- Fix 1: Update users with NULL display_name
-- Use email prefix as fallback display name
UPDATE users 
SET display_name = SPLIT_PART(email, '@', 1)
WHERE display_name IS NULL 
  AND email IS NOT NULL
  AND email != '';

-- Fix 2: Update users with empty display_name  
-- Use email prefix as fallback display name
UPDATE users 
SET display_name = SPLIT_PART(email, '@', 1)
WHERE (display_name = '' OR TRIM(display_name) = '')
  AND email IS NOT NULL
  AND email != '';

-- Fix 3: Handle edge case where email might also be missing
-- This should be rare but we'll set a default fallback
UPDATE users 
SET display_name = 'User ' || SUBSTRING(id::TEXT, 1, 8)
WHERE display_name IS NULL 
  OR display_name = '' 
  OR TRIM(display_name) = '';

-- Fix 4: Update the trigger function to prevent future NULL display_name issues
-- Enhance handle_new_user() trigger to always set display_name
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Extract display name from email if not provided
  IF NEW.display_name IS NULL OR TRIM(NEW.display_name) = '' THEN
    IF NEW.email IS NOT NULL AND NEW.email != '' THEN
      NEW.display_name := SPLIT_PART(NEW.email, '@', 1);
    ELSE
      NEW.display_name := 'User ' || SUBSTRING(NEW.id::TEXT, 1, 8);
    END IF;
  END IF;
  
  -- Ensure other required fields
  IF NEW.created_at IS NULL THEN
    NEW.created_at := NOW();
  END IF;
  
  -- Set default payment status
  IF NEW.payment_status IS NULL THEN
    NEW.payment_status := 'NotPaid';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix 5: Add a constraint to prevent future NULL display_name insertions
-- First, ensure all existing records are fixed (should be done by updates above)
-- Then add the constraint
ALTER TABLE users 
ADD CONSTRAINT users_display_name_not_null 
CHECK (display_name IS NOT NULL AND TRIM(display_name) != '');

-- Fix 6: Create a function to validate user profiles for pick submission
-- This can be called from the application layer as an additional safeguard
CREATE OR REPLACE FUNCTION validate_user_profile_for_picks(user_id UUID)
RETURNS TABLE(
  is_valid BOOLEAN,
  missing_fields TEXT[],
  display_name TEXT,
  email TEXT
) AS $$
DECLARE
  user_record RECORD;
  missing_fields_array TEXT[] := ARRAY[]::TEXT[];
  is_profile_valid BOOLEAN := TRUE;
BEGIN
  -- Get user record
  SELECT * INTO user_record FROM users WHERE id = user_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, ARRAY['user_not_found'], NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Check required fields
  IF user_record.display_name IS NULL OR TRIM(user_record.display_name) = '' THEN
    missing_fields_array := array_append(missing_fields_array, 'display_name');
    is_profile_valid := FALSE;
  END IF;
  
  IF user_record.email IS NULL OR TRIM(user_record.email) = '' THEN
    missing_fields_array := array_append(missing_fields_array, 'email');
    is_profile_valid := FALSE;
  END IF;
  
  RETURN QUERY SELECT 
    is_profile_valid,
    missing_fields_array,
    user_record.display_name,
    user_record.email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verify the fixes worked
DO $$
DECLARE
    null_count INTEGER;
    empty_count INTEGER;
    total_count INTEGER;
    fixed_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_count FROM users;
    SELECT COUNT(*) INTO null_count FROM users WHERE display_name IS NULL;
    SELECT COUNT(*) INTO empty_count FROM users WHERE display_name = '' OR TRIM(display_name) = '';
    
    fixed_count := total_count - null_count - empty_count;
    
    RAISE NOTICE '';
    RAISE NOTICE 'Migration 053 Results:';
    RAISE NOTICE '  Total users: %', total_count;
    RAISE NOTICE '  Users with valid display_name: %', fixed_count;
    RAISE NOTICE '  Users still with NULL display_name: %', null_count;
    RAISE NOTICE '  Users still with empty display_name: %', empty_count;
    
    IF null_count = 0 AND empty_count = 0 THEN
        RAISE NOTICE '✅ SUCCESS: All users now have valid display names!';
    ELSE
        RAISE NOTICE '⚠️  WARNING: Some users still need manual review';
    END IF;
END $$;

-- Create index for faster profile validation queries
CREATE INDEX IF NOT EXISTS idx_users_display_name_not_null 
ON users(id) WHERE display_name IS NOT NULL AND TRIM(display_name) != '';

COMMENT ON FUNCTION validate_user_profile_for_picks IS 'Validates user profile has all required fields for pick submission';
COMMENT ON FUNCTION handle_new_user IS 'Enhanced trigger function that ensures display_name is always set for new users';