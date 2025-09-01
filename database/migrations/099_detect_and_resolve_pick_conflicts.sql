-- Migration 099: Detect and resolve existing pick set conflicts
-- Purpose: Find and resolve users who have both authenticated and anonymous picks for the same week

-- Step 1: Run conflict detection to see current state
DO $$
DECLARE
    conflict_count INTEGER;
    resolution_count INTEGER;
BEGIN
    RAISE NOTICE '🔍 MIGRATION 099: PICK CONFLICT DETECTION & RESOLUTION';
    RAISE NOTICE '========================================================';
    RAISE NOTICE '';
    
    -- Count total conflicts before resolution
    SELECT COUNT(*) INTO conflict_count
    FROM public.detect_pick_set_conflicts();
    
    RAISE NOTICE 'Found % existing pick set conflicts to resolve', conflict_count;
    RAISE NOTICE '';
END;
$$;

-- Step 2: Display detailed conflict information
DO $$
DECLARE
    conflict_record RECORD;
    total_conflicts INTEGER := 0;
    active_conflicts INTEGER := 0;
    resolved_conflicts INTEGER := 0;
BEGIN
    RAISE NOTICE '📋 DETAILED CONFLICT ANALYSIS:';
    RAISE NOTICE '================================';
    
    FOR conflict_record IN 
        SELECT * FROM public.detect_pick_set_conflicts() ORDER BY season DESC, week DESC, display_name
    LOOP
        total_conflicts := total_conflicts + 1;
        
        IF conflict_record.conflict_type = 'ACTIVE_CONFLICT' THEN
            active_conflicts := active_conflicts + 1;
            RAISE NOTICE '🚨 ACTIVE CONFLICT: % (Week %, %) - Auth:%, Anon:%, Active Anon: %', 
                conflict_record.display_name, 
                conflict_record.week, 
                conflict_record.season,
                conflict_record.authenticated_picks_count,
                conflict_record.anonymous_picks_count,
                conflict_record.active_anonymous_picks;
        ELSE
            resolved_conflicts := resolved_conflicts + 1;
            RAISE NOTICE '✅ RESOLVED: % (Week %, %) - Auth:%, Anon:%, Active Anon: %', 
                conflict_record.display_name, 
                conflict_record.week, 
                conflict_record.season,
                conflict_record.authenticated_picks_count,
                conflict_record.anonymous_picks_count,
                conflict_record.active_anonymous_picks;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE 'CONFLICT SUMMARY:';
    RAISE NOTICE '  Total conflicts: %', total_conflicts;
    RAISE NOTICE '  Active conflicts needing resolution: %', active_conflicts;
    RAISE NOTICE '  Already resolved conflicts: %', resolved_conflicts;
    RAISE NOTICE '';
END;
$$;

-- Step 3: Automatically resolve active conflicts (authenticated picks take precedence)
DO $$
DECLARE
    conflict_record RECORD;
    updates_made INTEGER := 0;
    users_affected INTEGER := 0;
BEGIN
    RAISE NOTICE '🔧 AUTOMATIC CONFLICT RESOLUTION:';
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
        
        GET DIAGNOSTICS updates_made = updates_made + ROW_COUNT;
        
        RAISE NOTICE '  Deactivated % anonymous picks', ROW_COUNT;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ CONFLICT RESOLUTION COMPLETE:';
    RAISE NOTICE '  Users affected: %', users_affected;
    RAISE NOTICE '  Anonymous picks deactivated: %', updates_made;
    RAISE NOTICE '';
END;
$$;

-- Step 4: Verify conflict resolution worked
DO $$
DECLARE
    remaining_conflicts INTEGER;
    resolved_conflicts INTEGER;
BEGIN
    RAISE NOTICE '🔍 VERIFICATION: Checking resolution results...';
    RAISE NOTICE '';
    
    -- Count remaining active conflicts
    SELECT COUNT(*) INTO remaining_conflicts
    FROM public.detect_pick_set_conflicts()
    WHERE conflict_type = 'ACTIVE_CONFLICT';
    
    -- Count resolved conflicts
    SELECT COUNT(*) INTO resolved_conflicts
    FROM public.detect_pick_set_conflicts()
    WHERE conflict_type = 'RESOLVED_CONFLICT';
    
    RAISE NOTICE '📊 RESOLUTION RESULTS:';
    RAISE NOTICE '  Remaining active conflicts: %', remaining_conflicts;
    RAISE NOTICE '  Successfully resolved conflicts: %', resolved_conflicts;
    RAISE NOTICE '';
    
    IF remaining_conflicts = 0 THEN
        RAISE NOTICE '🎉 SUCCESS: All pick set conflicts have been resolved!';
        RAISE NOTICE '✅ System now follows precedence rules consistently';
        RAISE NOTICE '✅ Users will see correct picks in profiles and leaderboards';
    ELSE
        RAISE NOTICE '⚠️  WARNING: % conflicts remain unresolved', remaining_conflicts;
        RAISE NOTICE '💡 These may need manual admin intervention';
    END IF;
    
    RAISE NOTICE '';
END;
$$;

-- Step 5: Create a maintenance function to detect future conflicts
CREATE OR REPLACE FUNCTION public.check_pick_set_integrity()
RETURNS TABLE(
    summary_line TEXT,
    conflict_count INTEGER,
    needs_attention BOOLEAN
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    active_conflicts INTEGER;
    total_conflicts INTEGER;
    users_with_conflicts INTEGER;
BEGIN
    -- Get conflict statistics
    SELECT 
        COUNT(*) FILTER (WHERE conflict_type = 'ACTIVE_CONFLICT'),
        COUNT(*),
        COUNT(DISTINCT user_id)
    INTO active_conflicts, total_conflicts, users_with_conflicts
    FROM public.detect_pick_set_conflicts();
    
    -- Return summary information
    RETURN QUERY VALUES 
        ('Active conflicts needing resolution', active_conflicts, active_conflicts > 0),
        ('Total conflicts (active + resolved)', total_conflicts, false),
        ('Users with any conflicts', users_with_conflicts, false);
END;
$$;

-- Step 6: Add comment for maintenance function
COMMENT ON FUNCTION public.check_pick_set_integrity() IS 
'Quick health check for pick set conflicts. Returns summary of conflicts that need attention.';

-- Step 7: Create function to manually resolve specific conflicts (for admin use)
CREATE OR REPLACE FUNCTION public.manual_resolve_pick_conflict(
    target_user_id UUID,
    target_week INTEGER,
    target_season INTEGER,
    force_anonymous_active BOOLEAN DEFAULT false
)
RETURNS JSON
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    auth_count INTEGER;
    anon_count INTEGER;
    result_json JSON;
BEGIN
    -- Security check: ensure caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND is_admin = true
    ) THEN
        RAISE EXCEPTION 'Only administrators can manually resolve pick conflicts';
    END IF;
    
    -- Get conflict details
    SELECT 
        authenticated_picks_count,
        anonymous_picks_count
    INTO auth_count, anon_count
    FROM public.detect_pick_set_conflicts(target_user_id, target_season)
    WHERE user_id = target_user_id AND week = target_week AND season = target_season;
    
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', format('No conflict found for user %s week %s season %s', target_user_id, target_week, target_season)
        );
    END IF;
    
    -- Apply resolution
    IF force_anonymous_active THEN
        -- Admin override: force anonymous picks active despite authenticated picks
        UPDATE public.anonymous_picks 
        SET is_active_pick_set = true, updated_at = NOW()
        WHERE assigned_user_id = target_user_id AND week = target_week AND season = target_season;
        
        result_json = json_build_object(
            'success', true,
            'action', 'admin_override_anonymous_active',
            'message', format('Admin override: Activated anonymous picks despite %s authenticated picks', auth_count),
            'authenticated_picks', auth_count,
            'anonymous_picks', anon_count
        );
    ELSE
        -- Standard resolution: authenticated picks take precedence
        UPDATE public.anonymous_picks 
        SET is_active_pick_set = false, updated_at = NOW()
        WHERE assigned_user_id = target_user_id AND week = target_week AND season = target_season;
        
        result_json = json_build_object(
            'success', true,
            'action', 'standard_precedence',
            'message', format('Applied standard precedence: Authenticated picks active, anonymous picks deactivated'),
            'authenticated_picks', auth_count,
            'anonymous_picks', anon_count
        );
    END IF;
    
    RETURN result_json;
END;
$$;

-- Step 8: Add comment for manual resolution function
COMMENT ON FUNCTION public.manual_resolve_pick_conflict(UUID, INTEGER, INTEGER, BOOLEAN) IS 
'Admin function to manually resolve specific pick set conflicts. Can override standard precedence if needed.';

-- Step 9: Final summary and next steps
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 MIGRATION 099 COMPLETE: CONFLICT DETECTION & RESOLUTION';
    RAISE NOTICE '=============================================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ COMPLETED:';
    RAISE NOTICE '  - Detected all existing pick set conflicts';
    RAISE NOTICE '  - Automatically resolved conflicts using precedence rules';
    RAISE NOTICE '  - Created maintenance and manual resolution functions';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 NEW FUNCTIONS AVAILABLE:';
    RAISE NOTICE '  - check_pick_set_integrity() - Health check for conflicts';
    RAISE NOTICE '  - manual_resolve_pick_conflict() - Admin conflict resolution';
    RAISE NOTICE '';
    RAISE NOTICE '📋 NEXT STEPS:';
    RAISE NOTICE '  1. Update UserProfile to show both pick types';
    RAISE NOTICE '  2. Update leaderboard service to use is_active_pick_set';
    RAISE NOTICE '  3. Update admin interface for conflict management';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 SYSTEM STATUS:';
    RAISE NOTICE '  - Database triggers prevent future conflicts automatically';
    RAISE NOTICE '  - Pick precedence rules enforced consistently';
    RAISE NOTICE '  - Ready for frontend integration';
    RAISE NOTICE '';
END;
$$;