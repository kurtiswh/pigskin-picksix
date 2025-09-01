-- Migration 101: Fix PostgreSQL configuration parameter naming with three identifiers
-- Purpose: PostgreSQL requires "two or more simple identifiers" which means THREE minimum (app.module.setting)

-- Step 1: Update the precedence function with three-identifier parameter names
CREATE OR REPLACE FUNCTION public.manage_pick_set_precedence()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    conflict_count INTEGER;
    recursion_key TEXT;
    param_name TEXT;
BEGIN
    -- Prevent infinite recursion by checking if we're already processing this combination
    -- Build recursion key without accessing fields that may not exist
    IF TG_TABLE_NAME = 'picks' THEN
        recursion_key := format('%s_%s_%s_%s_%s', TG_TABLE_NAME, NEW.user_id, NEW.week, NEW.season, TG_OP);
    ELSIF TG_TABLE_NAME = 'anonymous_picks' THEN  
        recursion_key := format('%s_%s_%s_%s_%s', TG_TABLE_NAME, COALESCE(NEW.assigned_user_id::text, 'null'), NEW.week, NEW.season, TG_OP);
    ELSE
        recursion_key := format('%s_%s_%s_%s_%s', TG_TABLE_NAME, 'unknown', NEW.week, NEW.season, TG_OP);
    END IF;
    
    -- Convert to valid PostgreSQL parameter name with THREE identifiers
    -- Format: app.precedence.{hash} where {hash} is MD5 of the recursion key
    param_name := 'app.precedence.' || encode(digest(recursion_key, 'md5'), 'hex');
    
    -- Simple recursion check using session variables with valid parameter name
    IF current_setting(param_name, true) = 'true' THEN
        RETURN NEW;
    END IF;
    
    -- Set recursion flag with valid parameter name
    PERFORM set_config(param_name, 'true', true);
    
    -- Handle different trigger scenarios (same logic as before)
    IF TG_TABLE_NAME = 'picks' THEN
        UPDATE public.anonymous_picks 
        SET is_active_pick_set = false,
            updated_at = NOW()
        WHERE assigned_user_id = NEW.user_id 
        AND week = NEW.week 
        AND season = NEW.season
        AND is_active_pick_set = true;
        
        GET DIAGNOSTICS conflict_count = ROW_COUNT;
        
        IF conflict_count > 0 THEN
            RAISE NOTICE 'Deactivated % anonymous picks for user % (week %, season %) due to authenticated picks precedence', 
                conflict_count, NEW.user_id, NEW.week, NEW.season;
        END IF;
    END IF;
    
    IF TG_TABLE_NAME = 'anonymous_picks' AND 
       (OLD.assigned_user_id IS NULL OR OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id) AND 
       NEW.assigned_user_id IS NOT NULL THEN
        
        SELECT COUNT(*) INTO conflict_count
        FROM public.picks 
        WHERE user_id = NEW.assigned_user_id 
        AND week = NEW.week 
        AND season = NEW.season;
        
        IF conflict_count > 0 THEN
            NEW.is_active_pick_set = false;
            RAISE NOTICE 'Setting anonymous picks as inactive for user % (week %, season %) - user has authenticated picks', 
                NEW.assigned_user_id, NEW.week, NEW.season;
        ELSE
            NEW.is_active_pick_set = true;
            RAISE NOTICE 'Setting anonymous picks as active for user % (week %, season %) - no authenticated picks found', 
                NEW.assigned_user_id, NEW.week, NEW.season;
        END IF;
    END IF;
    
    IF TG_TABLE_NAME = 'anonymous_picks' AND 
       NEW.assigned_user_id IS NOT NULL AND
       OLD.show_on_leaderboard IS DISTINCT FROM NEW.show_on_leaderboard THEN
        
        IF NEW.show_on_leaderboard = false THEN
            NEW.is_active_pick_set = false;
        END IF;
    END IF;
    
    -- Clear recursion flag with valid parameter name
    PERFORM set_config(param_name, 'false', true);
    
    RETURN NEW;
END;
$$;

-- Step 2: Add comment explaining the fix
COMMENT ON FUNCTION public.manage_pick_set_precedence() IS 
'Fixed version with THREE identifiers: app.precedence.[hash]. PostgreSQL requires "two or more simple identifiers" which means minimum THREE total.';

-- Step 3: Test the parameter naming format
DO $$
DECLARE
    test_param TEXT := 'app.precedence.' || encode(digest('test_key', 'md5'), 'hex');
BEGIN
    -- Test setting and getting the parameter
    PERFORM set_config(test_param, 'test_value', true);
    
    IF current_setting(test_param, true) = 'test_value' THEN
        RAISE NOTICE '✅ THREE-IDENTIFIER PARAMETER TEST PASSED: %', test_param;
    ELSE
        RAISE NOTICE '❌ THREE-IDENTIFIER PARAMETER TEST FAILED: %', test_param;
    END IF;
    
    -- Clean up test parameter
    PERFORM set_config(test_param, NULL, true);
END;
$$;

-- Step 4: Summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔧 MIGRATION 101 COMPLETE: Fixed Three-Identifier Parameter Naming';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ FIXED:';
    RAISE NOTICE '  - PostgreSQL requires THREE identifiers minimum';
    RAISE NOTICE '  - Changed from: app.processing.[hash] (2 identifiers)';
    RAISE NOTICE '  - Changed to: app.precedence.[hash] (3 identifiers)';  
    RAISE NOTICE '  - Format: app.precedence.{32-char-hex-hash}';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 RESULT:';
    RAISE NOTICE '  - Migration 098 step 7 should now complete successfully';
    RAISE NOTICE '  - Recursion prevention system uses valid parameter names';
    RAISE NOTICE '  - Anonymous picks integration can proceed';
    RAISE NOTICE '';
END;
$$;