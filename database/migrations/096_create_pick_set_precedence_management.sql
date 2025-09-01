-- Migration 096: Create pick set precedence management system
-- Purpose: Automatically manage which pick sets are active for scoring to prevent conflicts

-- Step 1: Create function to manage pick set precedence
CREATE OR REPLACE FUNCTION public.manage_pick_set_precedence()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    conflict_count INTEGER;
BEGIN
    -- Handle different trigger scenarios
    
    -- SCENARIO 1: When authenticated picks are created/updated
    IF TG_TABLE_NAME = 'picks' THEN
        -- Deactivate any anonymous picks for this user/week/season
        UPDATE public.anonymous_picks 
        SET is_active_pick_set = false,
            updated_at = NOW()
        WHERE assigned_user_id = NEW.user_id 
        AND week = NEW.week 
        AND season = NEW.season
        AND is_active_pick_set = true;
        
        GET DIAGNOSTICS conflict_count = ROW_COUNT;
        
        -- Log if we deactivated anonymous picks due to authenticated picks
        IF conflict_count > 0 THEN
            RAISE NOTICE 'Deactivated % anonymous picks for user % (week %, season %) due to authenticated picks precedence', 
                conflict_count, NEW.user_id, NEW.week, NEW.season;
        END IF;
    END IF;
    
    -- SCENARIO 2: When anonymous picks are assigned to a user (assigned_user_id changes from NULL to a user)
    IF TG_TABLE_NAME = 'anonymous_picks' AND 
       (OLD.assigned_user_id IS NULL OR OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id) AND 
       NEW.assigned_user_id IS NOT NULL THEN
        
        -- Check if user has authenticated picks for this week/season
        SELECT COUNT(*) INTO conflict_count
        FROM public.picks 
        WHERE user_id = NEW.assigned_user_id 
        AND week = NEW.week 
        AND season = NEW.season;
        
        IF conflict_count > 0 THEN
            -- User has authenticated picks, keep anonymous picks inactive
            NEW.is_active_pick_set = false;
            RAISE NOTICE 'Setting anonymous picks as inactive for user % (week %, season %) - user has authenticated picks', 
                NEW.assigned_user_id, NEW.week, NEW.season;
        ELSE
            -- No authenticated picks, make anonymous picks active
            NEW.is_active_pick_set = true;
            RAISE NOTICE 'Setting anonymous picks as active for user % (week %, season %) - no authenticated picks found', 
                NEW.assigned_user_id, NEW.week, NEW.season;
        END IF;
    END IF;
    
    -- SCENARIO 3: When anonymous picks show_on_leaderboard is updated, ensure consistency
    IF TG_TABLE_NAME = 'anonymous_picks' AND 
       NEW.assigned_user_id IS NOT NULL AND
       OLD.show_on_leaderboard IS DISTINCT FROM NEW.show_on_leaderboard THEN
        
        -- If being removed from leaderboard, also deactivate
        IF NEW.show_on_leaderboard = false THEN
            NEW.is_active_pick_set = false;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Step 2: Add comment explaining the function
COMMENT ON FUNCTION public.manage_pick_set_precedence() IS 
'Manages pick set precedence rules: authenticated picks always take precedence over anonymous picks for the same user/week/season. Automatically sets is_active_pick_set flags to prevent scoring conflicts.';

-- Step 3: Create helper function to check for pick set conflicts (for admin tools)
CREATE OR REPLACE FUNCTION public.detect_pick_set_conflicts(
    check_user_id UUID DEFAULT NULL,
    check_season INTEGER DEFAULT NULL
)
RETURNS TABLE(
    user_id UUID,
    display_name TEXT,
    week INTEGER,
    season INTEGER,
    authenticated_picks_count INTEGER,
    anonymous_picks_count INTEGER,
    active_anonymous_picks BOOLEAN,
    conflict_type TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH user_picks AS (
        -- Get all users with both authenticated and anonymous picks
        SELECT 
            COALESCE(p.user_id, ap.assigned_user_id) as user_id,
            u.display_name,
            COALESCE(p.week, ap.week) as week,
            COALESCE(p.season, ap.season) as season,
            COUNT(p.id) as auth_count,
            COUNT(ap.id) as anon_count,
            BOOL_OR(ap.is_active_pick_set) as has_active_anon
        FROM public.picks p
        FULL OUTER JOIN public.anonymous_picks ap ON (
            p.user_id = ap.assigned_user_id AND 
            p.week = ap.week AND 
            p.season = ap.season
        )
        LEFT JOIN public.users u ON u.id = COALESCE(p.user_id, ap.assigned_user_id)
        WHERE 
            (check_user_id IS NULL OR COALESCE(p.user_id, ap.assigned_user_id) = check_user_id) AND
            (check_season IS NULL OR COALESCE(p.season, ap.season) = check_season) AND
            ap.assigned_user_id IS NOT NULL
        GROUP BY COALESCE(p.user_id, ap.assigned_user_id), u.display_name, COALESCE(p.week, ap.week), COALESCE(p.season, ap.season)
        HAVING COUNT(p.id) > 0 AND COUNT(ap.id) > 0  -- Only show where both types exist
    )
    SELECT 
        up.user_id,
        up.display_name,
        up.week,
        up.season,
        up.auth_count::INTEGER,
        up.anon_count::INTEGER,
        up.has_active_anon,
        CASE 
            WHEN up.auth_count > 0 AND up.anon_count > 0 AND up.has_active_anon = true THEN 'ACTIVE_CONFLICT'
            WHEN up.auth_count > 0 AND up.anon_count > 0 AND up.has_active_anon = false THEN 'RESOLVED_CONFLICT'
            ELSE 'UNKNOWN'
        END as conflict_type
    FROM user_picks up
    ORDER BY up.season DESC, up.week DESC, up.display_name;
END;
$$;

-- Step 4: Add comment for the conflict detection function
COMMENT ON FUNCTION public.detect_pick_set_conflicts(UUID, INTEGER) IS 
'Detects users with both authenticated and anonymous picks for the same week. Returns conflict details for admin review and resolution.';

-- Step 5: Create function for admin override of pick set precedence
CREATE OR REPLACE FUNCTION public.admin_override_pick_set_precedence(
    target_user_id UUID,
    target_week INTEGER,
    target_season INTEGER,
    make_anonymous_active BOOLEAN
)
RETURNS JSON
SECURITY DEFINER  
LANGUAGE plpgsql
AS $$
DECLARE
    auth_picks_count INTEGER;
    anon_picks_count INTEGER;
    result_json JSON;
BEGIN
    -- Security check: ensure caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = auth.uid() AND is_admin = true
    ) THEN
        RAISE EXCEPTION 'Only administrators can override pick set precedence';
    END IF;
    
    -- Count existing picks
    SELECT COUNT(*) INTO auth_picks_count
    FROM public.picks 
    WHERE user_id = target_user_id AND week = target_week AND season = target_season;
    
    SELECT COUNT(*) INTO anon_picks_count  
    FROM public.anonymous_picks
    WHERE assigned_user_id = target_user_id AND week = target_week AND season = target_season;
    
    -- Validate the operation
    IF auth_picks_count = 0 AND anon_picks_count = 0 THEN
        RAISE EXCEPTION 'No picks found for user % week % season %', target_user_id, target_week, target_season;
    END IF;
    
    IF make_anonymous_active AND anon_picks_count = 0 THEN
        RAISE EXCEPTION 'Cannot activate anonymous picks - user has no anonymous picks for week % season %', target_week, target_season;
    END IF;
    
    -- Perform the override
    IF make_anonymous_active THEN
        -- Make anonymous picks active (admin override)
        UPDATE public.anonymous_picks 
        SET is_active_pick_set = true, updated_at = NOW()
        WHERE assigned_user_id = target_user_id AND week = target_week AND season = target_season;
        
        result_json = json_build_object(
            'success', true,
            'action', 'activated_anonymous_picks',
            'message', format('Admin override: activated anonymous picks for user %s week %s season %s', target_user_id, target_week, target_season),
            'authenticated_picks_count', auth_picks_count,
            'anonymous_picks_count', anon_picks_count
        );
    ELSE
        -- Make sure anonymous picks are inactive (restore normal precedence)  
        UPDATE public.anonymous_picks 
        SET is_active_pick_set = false, updated_at = NOW()
        WHERE assigned_user_id = target_user_id AND week = target_week AND season = target_season;
        
        result_json = json_build_object(
            'success', true,
            'action', 'deactivated_anonymous_picks', 
            'message', format('Restored normal precedence: deactivated anonymous picks for user %s week %s season %s', target_user_id, target_week, target_season),
            'authenticated_picks_count', auth_picks_count,
            'anonymous_picks_count', anon_picks_count
        );
    END IF;
    
    RETURN result_json;
END;
$$;

-- Step 6: Add comment for admin override function
COMMENT ON FUNCTION public.admin_override_pick_set_precedence(UUID, INTEGER, INTEGER, BOOLEAN) IS 
'Admin function to override automatic pick set precedence. Allows admins to make anonymous picks active even when user has authenticated picks for the same week.';