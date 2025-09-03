-- Migration 117: Safe trigger management - only disable/enable user-defined triggers
-- This avoids system triggers and constraint triggers

DO $$
DECLARE
    trigger_record RECORD;
    disabled_triggers TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '🔧 Migration 117: Safe trigger management for picks table';
    RAISE NOTICE '================================================================';
    
    -- Only disable user-defined triggers (not system/constraint triggers)
    FOR trigger_record IN
        SELECT trigger_name, event_manipulation, action_timing
        FROM information_schema.triggers 
        WHERE event_object_table = 'picks'
        AND trigger_schema = 'public'
        AND trigger_name NOT LIKE 'RI_ConstraintTrigger%'  -- Skip constraint triggers
        AND trigger_name NOT LIKE '%system%'               -- Skip system triggers
    LOOP
        RAISE NOTICE 'Disabling user trigger: % (% %)', 
            trigger_record.trigger_name, 
            trigger_record.action_timing,
            trigger_record.event_manipulation;
        
        -- Disable the trigger
        EXECUTE format('ALTER TABLE public.picks DISABLE TRIGGER %I', trigger_record.trigger_name);
        
        -- Add to list of disabled triggers
        disabled_triggers := array_append(disabled_triggers, trigger_record.trigger_name);
    END LOOP;
    
    -- Store the list of disabled triggers for safe re-enabling
    INSERT INTO public.temp_disabled_triggers (table_name, disabled_trigger_names, disabled_at)
    VALUES ('picks', disabled_triggers, NOW())
    ON CONFLICT (table_name) DO UPDATE SET
        disabled_trigger_names = EXCLUDED.disabled_trigger_names,
        disabled_at = EXCLUDED.disabled_at;
        
    RAISE NOTICE '✅ Disabled % user-defined triggers on picks table', array_length(disabled_triggers, 1);
    RAISE NOTICE 'Triggers disabled: %', array_to_string(disabled_triggers, ', ');
END;
$$;

-- Create temp table to track disabled triggers if it doesn't exist
CREATE TABLE IF NOT EXISTS public.temp_disabled_triggers (
    table_name TEXT PRIMARY KEY,
    disabled_trigger_names TEXT[],
    disabled_at TIMESTAMP WITH TIME ZONE
);

-- Function to safely re-enable only the triggers we disabled
CREATE OR REPLACE FUNCTION public.reenable_user_triggers(target_table TEXT)
RETURNS TEXT AS $$
DECLARE
    trigger_name TEXT;
    disabled_list TEXT[];
    result_msg TEXT := '';
BEGIN
    -- Get the list of triggers we disabled
    SELECT disabled_trigger_names INTO disabled_list
    FROM public.temp_disabled_triggers
    WHERE table_name = target_table;
    
    IF disabled_list IS NULL THEN
        RETURN 'No disabled triggers found for table: ' || target_table;
    END IF;
    
    -- Re-enable each trigger we disabled
    FOREACH trigger_name IN ARRAY disabled_list
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', target_table, trigger_name);
        result_msg := result_msg || 'Re-enabled: ' || trigger_name || E'\n';
    END LOOP;
    
    -- Clean up the tracking table
    DELETE FROM public.temp_disabled_triggers WHERE table_name = target_table;
    
    RETURN result_msg || 'All user-defined triggers re-enabled for: ' || target_table;
END;
$$ LANGUAGE plpgsql;