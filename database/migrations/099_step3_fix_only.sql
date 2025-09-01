-- Migration 099 Step 3 Fix Only: Fix GET DIAGNOSTICS syntax error
-- Purpose: Replace the problematic step 3 from Migration 099 with correct PostgreSQL syntax

-- Step 3: Automatically resolve active conflicts (authenticated picks take precedence) - FIXED VERSION
DO $$
DECLARE
    conflict_record RECORD;
    updates_made INTEGER := 0;
    users_affected INTEGER := 0;
    current_row_count INTEGER;  -- Add temporary variable for ROW_COUNT
BEGIN
    RAISE NOTICE '🔧 AUTOMATIC CONFLICT RESOLUTION (FIXED):';
    RAISE NOTICE '==================================';
    RAISE NOTICE 'Applying precedence rule: Authenticated picks > Anonymous picks';
    RAISE NOTICE '';
    
    FOR conflict_record IN 
        SELECT * FROM public.detect_pick_set_conflicts() 
        WHERE conflict_type = 'ACTIVE_CONFLICT'
        ORDER BY season DESC, week DESC, display_name
    LOOP
        users_affected := users_affected + 1;
        
        RAISE NOTICE 'Resolving conflict for %: Week %, Season %', 
            conflict_record.display_name, conflict_record.week, conflict_record.season;
        
        -- Deactivate anonymous picks for this user/week/season since they have authenticated picks
        UPDATE public.anonymous_picks 
        SET 
            is_active_pick_set = false,
            updated_at = NOW()
        WHERE assigned_user_id = conflict_record.user_id 
        AND week = conflict_record.week 
        AND season = conflict_record.season
        AND is_active_pick_set = true;
        
        -- FIXED: Get ROW_COUNT first, then add to running total
        GET DIAGNOSTICS current_row_count = ROW_COUNT;
        updates_made := updates_made + current_row_count;
        
        RAISE NOTICE '  Deactivated % anonymous picks', current_row_count;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ CONFLICT RESOLUTION COMPLETE (FIXED):';
    RAISE NOTICE '  Users affected: %', users_affected;
    RAISE NOTICE '  Anonymous picks deactivated: %', updates_made;
    RAISE NOTICE '';
    
    RAISE NOTICE '🔧 SYNTAX FIX APPLIED:';
    RAISE NOTICE '  OLD: GET DIAGNOSTICS updates_made = updates_made + ROW_COUNT;';
    RAISE NOTICE '  NEW: GET DIAGNOSTICS current_row_count = ROW_COUNT; updates_made := updates_made + current_row_count;';
    RAISE NOTICE '';
END;
$$;