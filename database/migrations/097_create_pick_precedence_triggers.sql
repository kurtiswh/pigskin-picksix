-- Migration 097: Create triggers for automatic pick set precedence management
-- Purpose: Wire up the precedence management function to automatically handle conflicts

-- Step 1: Create trigger on picks table to handle authenticated pick precedence
DROP TRIGGER IF EXISTS manage_pick_precedence_on_picks ON public.picks;
CREATE TRIGGER manage_pick_precedence_on_picks
    AFTER INSERT OR UPDATE ON public.picks
    FOR EACH ROW
    EXECUTE FUNCTION public.manage_pick_set_precedence();

-- Step 2: Create trigger on anonymous_picks table to handle assignment precedence  
DROP TRIGGER IF EXISTS manage_pick_precedence_on_anonymous_picks ON public.anonymous_picks;
CREATE TRIGGER manage_pick_precedence_on_anonymous_picks
    BEFORE INSERT OR UPDATE ON public.anonymous_picks
    FOR EACH ROW
    EXECUTE FUNCTION public.manage_pick_set_precedence();

-- Step 3: Add trigger comments for documentation
COMMENT ON TRIGGER manage_pick_precedence_on_picks ON public.picks IS 
'Automatically deactivates anonymous picks when user creates/updates authenticated picks for the same week/season';

COMMENT ON TRIGGER manage_pick_precedence_on_anonymous_picks ON public.anonymous_picks IS 
'Automatically sets correct is_active_pick_set flag when anonymous picks are assigned to users based on existence of authenticated picks';

-- Step 4: Test the triggers with a verification query (for development)
-- This will be useful during testing to ensure triggers work correctly
CREATE OR REPLACE FUNCTION public.test_pick_precedence_system()
RETURNS TABLE(
    test_name TEXT,
    result TEXT,
    details TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    test_user_id UUID := 'test-user-' || gen_random_uuid()::text;
    test_season INTEGER := 2025;  
    test_week INTEGER := 1;
    test_game_id UUID;
    anon_pick_id UUID;
    auth_pick_id UUID;
    anon_active_before BOOLEAN;
    anon_active_after BOOLEAN;
BEGIN
    -- Setup: Get a test game
    SELECT id INTO test_game_id FROM public.games LIMIT 1;
    
    IF test_game_id IS NULL THEN
        RETURN QUERY SELECT 'SETUP'::TEXT, 'SKIP'::TEXT, 'No games found for testing'::TEXT;
        RETURN;
    END IF;
    
    -- Test 1: Create anonymous pick first, should be active
    INSERT INTO public.anonymous_picks (
        email, name, week, season, game_id, home_team, away_team, 
        selected_team, assigned_user_id, show_on_leaderboard
    ) VALUES (
        'test@example.com', 'Test User', test_week, test_season, test_game_id,
        'HOME', 'AWAY', 'HOME', test_user_id, true
    ) RETURNING id, is_active_pick_set INTO anon_pick_id, anon_active_before;
    
    RETURN QUERY SELECT 
        'Anonymous Pick Created'::TEXT,
        CASE WHEN anon_active_before THEN 'PASS' ELSE 'FAIL' END,
        format('Anonymous pick should be active when no auth picks exist: %s', anon_active_before);
    
    -- Test 2: Create authenticated pick, should deactivate anonymous pick
    INSERT INTO public.picks (
        user_id, game_id, week, season, selected_team, is_lock, submitted
    ) VALUES (
        test_user_id, test_game_id, test_week, test_season, 'HOME', false, true
    ) RETURNING id INTO auth_pick_id;
    
    -- Check if anonymous pick was deactivated
    SELECT is_active_pick_set INTO anon_active_after 
    FROM public.anonymous_picks WHERE id = anon_pick_id;
    
    RETURN QUERY SELECT 
        'Auth Pick Precedence'::TEXT,
        CASE WHEN NOT anon_active_after THEN 'PASS' ELSE 'FAIL' END,
        format('Anonymous pick should be deactivated when auth pick created: %s', anon_active_after);
    
    -- Test 3: Check conflict detection function
    IF EXISTS (
        SELECT 1 FROM public.detect_pick_set_conflicts(test_user_id, test_season)
        WHERE conflict_type = 'RESOLVED_CONFLICT'
    ) THEN
        RETURN QUERY SELECT 
            'Conflict Detection'::TEXT, 
            'PASS'::TEXT, 
            'Conflict properly detected and categorized as resolved'::TEXT;
    ELSE
        RETURN QUERY SELECT 
            'Conflict Detection'::TEXT, 
            'FAIL'::TEXT, 
            'Conflict detection function did not identify the test conflict'::TEXT;
    END IF;
    
    -- Cleanup test data
    DELETE FROM public.picks WHERE id = auth_pick_id;
    DELETE FROM public.anonymous_picks WHERE id = anon_pick_id;
    
    RETURN QUERY SELECT 'CLEANUP'::TEXT, 'COMPLETE'::TEXT, 'Test data removed'::TEXT;
END;
$$;

-- Step 5: Add test function comment
COMMENT ON FUNCTION public.test_pick_precedence_system() IS 
'Test function to verify pick precedence triggers are working correctly. Safe to run - cleans up test data automatically.';

-- Step 6: Add safety check to prevent infinite recursion in triggers
-- Update the precedence function with recursion protection
CREATE OR REPLACE FUNCTION public.manage_pick_set_precedence()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    conflict_count INTEGER;
    recursion_key TEXT;
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
    
    -- Simple recursion check using session variables
    IF current_setting('app.processing_precedence_' || recursion_key, true) = 'true' THEN
        RETURN NEW;
    END IF;
    
    -- Set recursion flag
    PERFORM set_config('app.processing_precedence_' || recursion_key, 'true', true);
    
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
    
    -- Clear recursion flag
    PERFORM set_config('app.processing_precedence_' || recursion_key, 'false', true);
    
    RETURN NEW;
END;
$$;