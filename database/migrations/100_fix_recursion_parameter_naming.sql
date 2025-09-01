-- Migration 100: Fix PostgreSQL configuration parameter naming for recursion prevention
-- Purpose: Fix invalid configuration parameter names that violate PostgreSQL naming rules

-- Step 1: Update the precedence function with valid parameter names
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
        -- Use a hash to create valid parameter names - PostgreSQL allows only alphanumeric and underscores
        recursion_key := format('%s_%s_%s_%s_%s', TG_TABLE_NAME, NEW.user_id, NEW.week, NEW.season, TG_OP);
    ELSIF TG_TABLE_NAME = 'anonymous_picks' THEN  
        recursion_key := format('%s_%s_%s_%s_%s', TG_TABLE_NAME, COALESCE(NEW.assigned_user_id::text, 'null'), NEW.week, NEW.season, TG_OP);
    ELSE
        recursion_key := format('%s_%s_%s_%s_%s', TG_TABLE_NAME, 'unknown', NEW.week, NEW.season, TG_OP);
    END IF;
    
    -- Convert to valid PostgreSQL parameter name by:
    -- 1. Replacing hyphens with underscores
    -- 2. Creating a hash if too long
    -- 3. Ensuring format is app.prefix.hash_value
    param_name := 'app.processing.' || encode(digest(recursion_key, 'md5'), 'hex');
    
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
'Fixed version: Manages pick set precedence rules using MD5 hash for valid PostgreSQL configuration parameter names. Authenticated picks always take precedence over anonymous picks.';

-- Step 3: Summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔧 MIGRATION 100 COMPLETE: Fixed PostgreSQL Parameter Naming';
    RAISE NOTICE '========================================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ FIXED:';
    RAISE NOTICE '  - PostgreSQL configuration parameter naming violation';
    RAISE NOTICE '  - Uses MD5 hash to create valid parameter names';  
    RAISE NOTICE '  - Format: app.processing.[md5_hash]';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 RESULT:';
    RAISE NOTICE '  - Migration 098 should now complete without parameter errors';
    RAISE NOTICE '  - Recursion prevention system works with valid parameter names';
    RAISE NOTICE '  - Anonymous picks integration can proceed';
    RAISE NOTICE '';
END;
$$;