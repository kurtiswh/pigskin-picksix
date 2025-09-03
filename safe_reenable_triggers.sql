-- Safe re-enable of user-defined triggers only (avoiding system triggers)

DO $$
DECLARE
    trigger_record RECORD;
    enabled_count INTEGER := 0;
    skipped_count INTEGER := 0;
BEGIN
    RAISE NOTICE '🔄 Re-enabling user-defined triggers on picks table (skipping system triggers)';
    RAISE NOTICE '================================================================';
    
    -- Only re-enable user-defined triggers (not system/constraint triggers)
    FOR trigger_record IN
        SELECT trigger_name, event_manipulation, action_timing
        FROM information_schema.triggers 
        WHERE event_object_table = 'picks'
        AND trigger_schema = 'public'
        AND trigger_name NOT LIKE 'RI_ConstraintTrigger%'  -- Skip constraint triggers
        AND trigger_name NOT LIKE '%system%'               -- Skip system triggers
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.picks ENABLE TRIGGER %I', trigger_record.trigger_name);
            RAISE NOTICE '✅ Re-enabled: % (% %)', 
                trigger_record.trigger_name,
                trigger_record.action_timing,
                trigger_record.event_manipulation;
            enabled_count := enabled_count + 1;
        EXCEPTION 
            WHEN OTHERS THEN
                RAISE NOTICE '⚠️ Skipped: % (Error: %)', 
                    trigger_record.trigger_name, SQLERRM;
                skipped_count := skipped_count + 1;
        END;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ Re-enabled % user-defined triggers', enabled_count;
    IF skipped_count > 0 THEN
        RAISE NOTICE '⚠️ Skipped % triggers (likely already enabled or system triggers)', skipped_count;
    END IF;
    RAISE NOTICE '================================================================';
END;
$$;

-- Clean up the comment we added earlier
COMMENT ON TABLE public.picks IS NULL;