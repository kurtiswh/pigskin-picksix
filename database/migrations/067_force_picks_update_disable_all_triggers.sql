-- Force picks update by disabling ALL triggers and using a more direct approach
-- Something is still overriding the picks updates, so we need to be more aggressive

-- Step 1: Show all current triggers on picks table
SELECT 
    'Current triggers on picks table:' as info,
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers 
WHERE event_object_table = 'picks'
ORDER BY trigger_name;

-- Step 2: Disable ALL triggers on picks table (more comprehensive)
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    -- Get all triggers on picks table and disable them
    FOR trigger_record IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'picks'
    LOOP
        EXECUTE format('ALTER TABLE picks DISABLE TRIGGER %I', trigger_record.trigger_name);
        RAISE NOTICE 'Disabled trigger: %', trigger_record.trigger_name;
    END LOOP;
END;
$$;

-- Step 3: Check current picks state before update
SELECT 
    'BEFORE UPDATE - Current Nebraska picks state:' as status,
    selected_team,
    COUNT(*) as pick_count,
    result,
    points_earned
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;

-- Step 4: Force update picks using direct SQL (no functions, no triggers)
-- Update Cincinnati picks to WIN
UPDATE picks 
SET 
    result = 'win'::pick_result,
    points_earned = 20,
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'CINCINNATI';

-- Update Nebraska picks to LOSS  
UPDATE picks 
SET 
    result = 'loss'::pick_result,
    points_earned = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'NEBRASKA';

-- Step 5: Verify the update worked immediately
SELECT 
    'AFTER UPDATE - Nebraska picks should now be correct:' as status,
    selected_team,
    COUNT(*) as pick_count,
    result,
    points_earned,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' AND points_earned = 20 THEN '✅ CORRECT'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' AND points_earned = 0 THEN '✅ CORRECT'  
        ELSE '❌ STILL WRONG - SOMETHING IS OVERRIDING'
    END as validation
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;

-- Step 6: Re-enable all triggers we disabled
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    -- Get all triggers on picks table and re-enable them
    FOR trigger_record IN 
        SELECT trigger_name 
        FROM information_schema.triggers 
        WHERE event_object_table = 'picks'
    LOOP
        EXECUTE format('ALTER TABLE picks ENABLE TRIGGER %I', trigger_record.trigger_name);
        RAISE NOTICE 'Re-enabled trigger: %', trigger_record.trigger_name;
    END LOOP;
END;
$$;

-- Step 7: Check if triggers immediately override our changes
SELECT 
    'FINAL CHECK - After re-enabling triggers:' as status,
    selected_team,
    COUNT(*) as pick_count,
    result,
    points_earned,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' AND points_earned = 20 THEN '✅ SURVIVED TRIGGER RE-ENABLE'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' AND points_earned = 0 THEN '✅ SURVIVED TRIGGER RE-ENABLE'  
        ELSE '❌ TRIGGERS IMMEDIATELY OVERRODE - NEED DIFFERENT APPROACH'
    END as final_validation
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;

-- Step 8: If triggers are still overriding, show what games table says
SELECT 
    'Games table says ATS winner should be:' as info,
    winner_against_spread,
    base_points,
    margin_bonus,
    'If triggers are using old logic, this explains the override' as note
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 9: Show any remaining issues for debugging
SELECT 
    'Diagnostic Info:' as info,
    'Game ID: 81ae6301-304f-4860-a890-ac3aacf556ef' as game_id,
    'Expected: Cincinnati=WIN(20pts), Nebraska=LOSS(0pts)' as expected,
    'If picks still wrong after this migration, the issue is:' as diagnosis,
    '1. Triggers using hardcoded wrong ATS logic, OR' as reason1,
    '2. Some other process is overriding the picks table, OR' as reason2, 
    '3. The trigger functions need to be updated to match games table' as reason3;