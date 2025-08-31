-- Debug: Find what triggers are causing picks table updates to fail
-- Error: record "old" has no field "assigned_user_id"

-- Check all triggers on the picks table
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement,
    action_condition
FROM information_schema.triggers 
WHERE event_object_table = 'picks'
ORDER BY trigger_name;

-- Also check triggers on anonymous_picks for comparison
SELECT 
    trigger_name,
    event_manipulation,  
    action_timing,
    action_statement,
    action_condition
FROM information_schema.triggers 
WHERE event_object_table = 'anonymous_picks'
ORDER BY trigger_name;

-- Check the schema of both tables
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'picks' 
ORDER BY ordinal_position;

SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'anonymous_picks' 
ORDER BY ordinal_position;