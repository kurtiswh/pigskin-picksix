-- Fix Missing Trigger Function: check_anonymous_picks_limit
-- 
-- This script creates the missing function that the trigger needs

DO $$
BEGIN
    RAISE NOTICE '🔧 Creating missing trigger function: check_anonymous_picks_limit';
    RAISE NOTICE '================================================================';
END;
$$;

-- Create the missing function for anonymous picks limit enforcement
CREATE OR REPLACE FUNCTION public.check_anonymous_picks_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_pick_count INTEGER;
    max_picks_per_week INTEGER := 6; -- Standard limit: 6 picks per week
    max_locks_per_week INTEGER := 1; -- Standard limit: 1 lock per week
    current_lock_count INTEGER;
BEGIN
    -- Only check on INSERT or when changing game_id/week/season
    IF TG_OP = 'UPDATE' THEN
        IF NEW.game_id = OLD.game_id AND 
           NEW.week = OLD.week AND 
           NEW.season = OLD.season AND
           NEW.email = OLD.email THEN
            -- No relevant changes, allow update
            RETURN NEW;
        END IF;
    END IF;
    
    -- Count existing picks for this email/week/season (excluding current row on UPDATE)
    IF TG_OP = 'UPDATE' THEN
        SELECT COUNT(*) INTO current_pick_count
        FROM public.anonymous_picks
        WHERE email = NEW.email 
        AND week = NEW.week 
        AND season = NEW.season
        AND id != NEW.id;
    ELSE
        SELECT COUNT(*) INTO current_pick_count
        FROM public.anonymous_picks
        WHERE email = NEW.email 
        AND week = NEW.week 
        AND season = NEW.season;
    END IF;
    
    -- Check pick limit
    IF current_pick_count >= max_picks_per_week THEN
        RAISE EXCEPTION 'Cannot add more picks. User % already has % picks for week % of season %', 
            NEW.email, current_pick_count, NEW.week, NEW.season;
    END IF;
    
    -- If this is a lock pick, check lock limit
    IF NEW.is_lock = TRUE THEN
        IF TG_OP = 'UPDATE' THEN
            SELECT COUNT(*) INTO current_lock_count
            FROM public.anonymous_picks
            WHERE email = NEW.email 
            AND week = NEW.week 
            AND season = NEW.season
            AND is_lock = TRUE
            AND id != NEW.id;
        ELSE
            SELECT COUNT(*) INTO current_lock_count
            FROM public.anonymous_picks
            WHERE email = NEW.email 
            AND week = NEW.week 
            AND season = NEW.season
            AND is_lock = TRUE;
        END IF;
        
        IF current_lock_count >= max_locks_per_week THEN
            RAISE EXCEPTION 'Cannot add more lock picks. User % already has % lock pick for week % of season %', 
                NEW.email, current_lock_count, NEW.week, NEW.season;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION public.check_anonymous_picks_limit IS 
'Enforces pick limits for anonymous picks: max 6 picks per week, max 1 lock per week per email';

-- Now try to create the trigger (if it doesn't exist)
DO $$
BEGIN
    -- Check if trigger exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'enforce_anonymous_picks_limit'
        AND tgrelid = 'public.anonymous_picks'::regclass
    ) THEN
        -- Create the trigger
        CREATE TRIGGER enforce_anonymous_picks_limit
            BEFORE INSERT OR UPDATE ON public.anonymous_picks
            FOR EACH ROW
            EXECUTE FUNCTION public.check_anonymous_picks_limit();
            
        RAISE NOTICE '✅ Trigger enforce_anonymous_picks_limit created successfully';
    ELSE
        RAISE NOTICE '✅ Trigger enforce_anonymous_picks_limit already exists';
    END IF;
END;
$$;

-- Also create the authenticated picks limit function if missing
CREATE OR REPLACE FUNCTION public.check_picks_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    current_pick_count INTEGER;
    max_picks_per_week INTEGER := 6; -- Standard limit: 6 picks per week
    max_locks_per_week INTEGER := 1; -- Standard limit: 1 lock per week
    current_lock_count INTEGER;
BEGIN
    -- Only check on INSERT or when changing game_id/week/season
    IF TG_OP = 'UPDATE' THEN
        IF NEW.game_id = OLD.game_id AND 
           NEW.week = OLD.week AND 
           NEW.season = OLD.season AND
           NEW.user_id = OLD.user_id THEN
            -- No relevant changes, allow update
            RETURN NEW;
        END IF;
    END IF;
    
    -- Count existing picks for this user/week/season (excluding current row on UPDATE)
    IF TG_OP = 'UPDATE' THEN
        SELECT COUNT(*) INTO current_pick_count
        FROM public.picks
        WHERE user_id = NEW.user_id 
        AND week = NEW.week 
        AND season = NEW.season
        AND id != NEW.id;
    ELSE
        SELECT COUNT(*) INTO current_pick_count
        FROM public.picks
        WHERE user_id = NEW.user_id 
        AND week = NEW.week 
        AND season = NEW.season;
    END IF;
    
    -- Check pick limit
    IF current_pick_count >= max_picks_per_week THEN
        RAISE EXCEPTION 'Cannot add more picks. User already has % picks for week % of season %', 
            current_pick_count, NEW.week, NEW.season;
    END IF;
    
    -- If this is a lock pick, check lock limit
    IF NEW.is_lock = TRUE THEN
        IF TG_OP = 'UPDATE' THEN
            SELECT COUNT(*) INTO current_lock_count
            FROM public.picks
            WHERE user_id = NEW.user_id 
            AND week = NEW.week 
            AND season = NEW.season
            AND is_lock = TRUE
            AND id != NEW.id;
        ELSE
            SELECT COUNT(*) INTO current_lock_count
            FROM public.picks
            WHERE user_id = NEW.user_id 
            AND week = NEW.week 
            AND season = NEW.season
            AND is_lock = TRUE;
        END IF;
        
        IF current_lock_count >= max_locks_per_week THEN
            RAISE EXCEPTION 'Cannot add more lock picks. User already has % lock pick for week % of season %', 
                current_lock_count, NEW.week, NEW.season;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION public.check_picks_limit IS 
'Enforces pick limits for authenticated picks: max 6 picks per week, max 1 lock per week per user';

-- Create the authenticated picks trigger if missing
DO $$
BEGIN
    -- Check if trigger exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'enforce_picks_limit'
        AND tgrelid = 'public.picks'::regclass
    ) THEN
        -- Create the trigger
        CREATE TRIGGER enforce_picks_limit
            BEFORE INSERT OR UPDATE ON public.picks
            FOR EACH ROW
            EXECUTE FUNCTION public.check_picks_limit();
            
        RAISE NOTICE '✅ Trigger enforce_picks_limit created successfully';
    ELSE
        RAISE NOTICE '✅ Trigger enforce_picks_limit already exists';
    END IF;
END;
$$;

-- Summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Missing trigger functions have been created!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Functions created/verified:';
    RAISE NOTICE '   - check_anonymous_picks_limit() for anonymous picks';
    RAISE NOTICE '   - check_picks_limit() for authenticated picks';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Triggers created/verified:';
    RAISE NOTICE '   - enforce_anonymous_picks_limit on anonymous_picks table';
    RAISE NOTICE '   - enforce_picks_limit on picks table';
    RAISE NOTICE '';
    RAISE NOTICE '✅ You can now safely re-enable any other triggers that depend on these functions';
END;
$$;