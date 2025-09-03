-- Re-enable Only the Original Triggers for anonymous_picks
-- Based on the screenshot showing which triggers were originally active

DO $$
BEGIN
    RAISE NOTICE '🔧 Re-enabling only the original triggers for anonymous_picks';
    RAISE NOTICE '==============================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'These triggers were originally enabled:';
    RAISE NOTICE '  1. handle_anonymous_pick_assignment_trigger';
    RAISE NOTICE '  2. update_anonymous_picks_from_games_trigger';
    RAISE NOTICE '  3. update_anonymous_picks_from_completed_games';
    RAISE NOTICE '  4. update_anonymous_picks_updated_at_trigger';
    RAISE NOTICE '';
END;
$$;

-- 1. Re-enable handle_anonymous_pick_assignment_trigger
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'handle_anonymous_pick_assignment_trigger'
        AND tgrelid = 'public.anonymous_picks'::regclass
    ) THEN
        ALTER TABLE public.anonymous_picks ENABLE TRIGGER handle_anonymous_pick_assignment_trigger;
        RAISE NOTICE '✅ Re-enabled: handle_anonymous_pick_assignment_trigger';
    ELSE
        RAISE NOTICE '⚠️  Trigger not found: handle_anonymous_pick_assignment_trigger';
    END IF;
END;
$$;

-- 2. Re-enable update_anonymous_picks_from_games_trigger
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_anonymous_picks_from_games_trigger'
        AND tgrelid = 'public.anonymous_picks'::regclass
    ) THEN
        ALTER TABLE public.anonymous_picks ENABLE TRIGGER update_anonymous_picks_from_games_trigger;
        RAISE NOTICE '✅ Re-enabled: update_anonymous_picks_from_games_trigger';
    ELSE
        RAISE NOTICE '⚠️  Trigger not found: update_anonymous_picks_from_games_trigger';
    END IF;
END;
$$;

-- 3. Re-enable update_anonymous_picks_from_completed_games
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_anonymous_picks_from_completed_games'
        AND tgrelid = 'public.anonymous_picks'::regclass
    ) THEN
        ALTER TABLE public.anonymous_picks ENABLE TRIGGER update_anonymous_picks_from_completed_games;
        RAISE NOTICE '✅ Re-enabled: update_anonymous_picks_from_completed_games';
    ELSE
        RAISE NOTICE '⚠️  Trigger not found: update_anonymous_picks_from_completed_games';
    END IF;
END;
$$;

-- 4. Re-enable update_anonymous_picks_updated_at_trigger
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'update_anonymous_picks_updated_at_trigger'
        AND tgrelid = 'public.anonymous_picks'::regclass
    ) THEN
        ALTER TABLE public.anonymous_picks ENABLE TRIGGER update_anonymous_picks_updated_at_trigger;
        RAISE NOTICE '✅ Re-enabled: update_anonymous_picks_updated_at_trigger';
    ELSE
        RAISE NOTICE '⚠️  Trigger not found: update_anonymous_picks_updated_at_trigger';
    END IF;
END;
$$;

-- Show final status of all triggers on anonymous_picks
DO $$
DECLARE
    rec RECORD;
    enabled_count INTEGER := 0;
    disabled_count INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '📋 Final status of triggers on anonymous_picks table:';
    RAISE NOTICE '======================================================';
    
    FOR rec IN 
        SELECT 
            t.tgname as trigger_name,
            CASE 
                WHEN t.tgenabled = 'O' THEN 'ENABLED' 
                WHEN t.tgenabled = 'D' THEN 'DISABLED'
                WHEN t.tgenabled = 'R' THEN 'REPLICA'
                WHEN t.tgenabled = 'A' THEN 'ALWAYS'
                ELSE 'UNKNOWN'
            END as status
        FROM pg_trigger t
        WHERE t.tgrelid = 'public.anonymous_picks'::regclass
        AND t.tgisinternal = FALSE
        ORDER BY t.tgname
    LOOP
        RAISE NOTICE '   - % [%]', rec.trigger_name, rec.status;
        
        IF rec.status = 'ENABLED' OR rec.status = 'ALWAYS' THEN
            enabled_count := enabled_count + 1;
        ELSE
            disabled_count := disabled_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ Summary: % enabled, % disabled', enabled_count, disabled_count;
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Only the 4 original triggers should be enabled now!';
END;
$$;