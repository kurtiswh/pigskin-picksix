-- Safe Re-enable Triggers Script
-- This script safely re-enables triggers by first checking that required functions exist

DO $$
DECLARE
    missing_functions TEXT := '';
    can_proceed BOOLEAN := TRUE;
BEGIN
    RAISE NOTICE '🔧 Safely re-enabling triggers with dependency checks';
    RAISE NOTICE '======================================================';
    
    -- Check for required functions
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_anonymous_picks_limit') THEN
        missing_functions := missing_functions || 'check_anonymous_picks_limit, ';
        can_proceed := FALSE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_picks_limit') THEN
        missing_functions := missing_functions || 'check_picks_limit, ';
        can_proceed := FALSE;
    END IF;
    
    -- If functions are missing, report and exit
    IF NOT can_proceed THEN
        RAISE NOTICE '';
        RAISE NOTICE '❌ Cannot re-enable triggers - missing functions: %', missing_functions;
        RAISE NOTICE '';
        RAISE NOTICE '📋 To fix this, first run:';
        RAISE NOTICE '   psql -f database/fix_missing_trigger_function.sql';
        RAISE NOTICE '';
        RETURN;
    END IF;
    
    -- All functions exist, proceed with re-enabling triggers
    RAISE NOTICE '✅ All required functions found, proceeding with trigger re-enable...';
    
    -- Re-enable trigger for anonymous picks limit
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'enforce_anonymous_picks_limit'
        AND tgrelid = 'public.anonymous_picks'::regclass
    ) THEN
        CREATE TRIGGER enforce_anonymous_picks_limit
            BEFORE INSERT OR UPDATE ON public.anonymous_picks
            FOR EACH ROW
            EXECUTE FUNCTION public.check_anonymous_picks_limit();
        RAISE NOTICE '✅ Created trigger: enforce_anonymous_picks_limit';
    ELSE
        ALTER TABLE public.anonymous_picks ENABLE TRIGGER enforce_anonymous_picks_limit;
        RAISE NOTICE '✅ Re-enabled trigger: enforce_anonymous_picks_limit';
    END IF;
    
    -- Re-enable trigger for authenticated picks limit
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'enforce_picks_limit'
        AND tgrelid = 'public.picks'::regclass
    ) THEN
        CREATE TRIGGER enforce_picks_limit
            BEFORE INSERT OR UPDATE ON public.picks
            FOR EACH ROW
            EXECUTE FUNCTION public.check_picks_limit();
        RAISE NOTICE '✅ Created trigger: enforce_picks_limit';
    ELSE
        ALTER TABLE public.picks ENABLE TRIGGER enforce_picks_limit;
        RAISE NOTICE '✅ Re-enabled trigger: enforce_picks_limit';
    END IF;
    
    -- Re-enable other common triggers if they exist
    -- (These use ALTER TABLE ... ENABLE TRIGGER which is safe even if trigger doesn't exist)
    
    -- For picks table
    PERFORM 1 FROM pg_trigger WHERE tgname = 'update_weekly_leaderboard_trigger' AND tgrelid = 'public.picks'::regclass;
    IF FOUND THEN
        ALTER TABLE public.picks ENABLE TRIGGER update_weekly_leaderboard_trigger;
        RAISE NOTICE '✅ Re-enabled trigger: update_weekly_leaderboard_trigger';
    END IF;
    
    PERFORM 1 FROM pg_trigger WHERE tgname = 'update_season_leaderboard_trigger' AND tgrelid = 'public.picks'::regclass;
    IF FOUND THEN
        ALTER TABLE public.picks ENABLE TRIGGER update_season_leaderboard_trigger;
        RAISE NOTICE '✅ Re-enabled trigger: update_season_leaderboard_trigger';
    END IF;
    
    -- For anonymous_picks table
    PERFORM 1 FROM pg_trigger WHERE tgname = 'handle_anonymous_pick_assignment_trigger' AND tgrelid = 'public.anonymous_picks'::regclass;
    IF FOUND THEN
        ALTER TABLE public.anonymous_picks ENABLE TRIGGER handle_anonymous_pick_assignment_trigger;
        RAISE NOTICE '✅ Re-enabled trigger: handle_anonymous_pick_assignment_trigger';
    END IF;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ Trigger re-enable process complete!';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Active triggers summary:';
    
    -- Show current trigger status
    FOR rec IN 
        SELECT 
            t.tgname as trigger_name,
            c.relname as table_name,
            CASE WHEN t.tgenabled = 'O' THEN 'ENABLED' ELSE 'DISABLED' END as status
        FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        WHERE c.relname IN ('picks', 'anonymous_picks')
        AND t.tgisinternal = FALSE
        ORDER BY c.relname, t.tgname
    LOOP
        RAISE NOTICE '   - %.% [%]', rec.table_name, rec.trigger_name, rec.status;
    END LOOP;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE '❌ Error during trigger re-enable: %', SQLERRM;
        RAISE NOTICE 'You may need to manually fix the issue and try again';
END;
$$;