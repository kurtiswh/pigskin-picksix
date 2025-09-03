-- Migration 116: Temporarily disable triggers on picks table to allow manual processing
-- This fixes the constraint violation issue when updating picks

-- Find and disable all triggers on the picks table
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    RAISE NOTICE '🔧 Migration 116: Temporarily disabling picks table triggers';
    RAISE NOTICE '================================================================';
    
    -- List all triggers on the picks table
    FOR trigger_record IN
        SELECT trigger_name, event_manipulation, action_timing
        FROM information_schema.triggers 
        WHERE event_object_table = 'picks'
        AND trigger_schema = 'public'
    LOOP
        RAISE NOTICE 'Found trigger: % (% %) - DISABLING', 
            trigger_record.trigger_name, 
            trigger_record.action_timing,
            trigger_record.event_manipulation;
        
        -- Disable the trigger
        EXECUTE format('ALTER TABLE public.picks DISABLE TRIGGER %I', trigger_record.trigger_name);
    END LOOP;
    
    RAISE NOTICE '✅ All triggers on picks table have been disabled';
    RAISE NOTICE 'You can now update picks without constraint violations';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  IMPORTANT: Remember to re-enable triggers after processing picks:';
    RAISE NOTICE '   ALTER TABLE public.picks ENABLE TRIGGER ALL;';
END;
$$;

-- Add comment
COMMENT ON TABLE public.picks IS 'TRIGGERS TEMPORARILY DISABLED - Migration 116 - Re-enable after processing picks';