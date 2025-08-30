-- Debug why picks updates are failing even with triggers disabled
-- This will identify RLS policies, constraints, or other blockers

-- Step 1: Check if RLS is enabled on picks table
SELECT 
    'RLS Status on picks table:' as info,
    schemaname,
    tablename,
    rowsecurity as rls_enabled,
    'If TRUE, RLS policies may be blocking updates' as note
FROM pg_tables 
WHERE tablename = 'picks';

-- Step 2: Show all RLS policies on picks table
SELECT 
    'RLS Policies on picks table:' as info,
    policyname,
    cmd as command_type,
    roles,
    qual as policy_condition,
    with_check
FROM pg_policies 
WHERE tablename = 'picks'
ORDER BY policyname;

-- Step 3: Check constraints on picks table
SELECT 
    'Constraints on picks table:' as info,
    constraint_name,
    constraint_type,
    'CHECK constraints might prevent result/points updates' as note
FROM information_schema.table_constraints 
WHERE table_name = 'picks' AND table_schema = 'public'
ORDER BY constraint_type, constraint_name;

-- Step 4: Try update with explicit transaction and detailed error catching
DO $$
DECLARE 
    update_count INTEGER;
    error_message TEXT;
BEGIN
    -- Start explicit transaction
    BEGIN
        -- Try updating Cincinnati picks
        UPDATE picks 
        SET 
            result = 'win'::pick_result,
            points_earned = 20,
            updated_at = CURRENT_TIMESTAMP
        WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
          AND selected_team = 'CINCINNATI';
        
        GET DIAGNOSTICS update_count = ROW_COUNT;
        RAISE NOTICE 'Cincinnati update affected % rows', update_count;
        
        -- Try updating Nebraska picks  
        UPDATE picks 
        SET 
            result = 'loss'::pick_result,
            points_earned = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
          AND selected_team = 'NEBRASKA';
          
        GET DIAGNOSTICS update_count = ROW_COUNT;
        RAISE NOTICE 'Nebraska update affected % rows', update_count;
        
        -- Force commit
        COMMIT;
        RAISE NOTICE 'Transaction committed successfully';
        
    EXCEPTION 
        WHEN OTHERS THEN
            error_message := SQLERRM;
            RAISE NOTICE 'UPDATE FAILED: %', error_message;
            ROLLBACK;
    END;
END;
$$;

-- Step 5: Check the actual data immediately after explicit update
SELECT 
    'Immediate check after explicit update:' as status,
    selected_team,
    result,
    points_earned,
    updated_at,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' THEN '✅ Cincinnati correct'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' THEN '✅ Nebraska correct'
        ELSE '❌ Still wrong: ' || selected_team || ' = ' || result::text || ' (' || points_earned || ' pts)'
    END as validation
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
ORDER BY selected_team, result;

-- Step 6: Try a different approach - direct value insertion to test permissions
DO $$
DECLARE
    test_pick_id UUID;
    can_insert BOOLEAN := FALSE;
    can_update BOOLEAN := FALSE;
BEGIN
    -- Test if we can insert a test record
    BEGIN
        INSERT INTO picks (
            id, user_id, game_id, week, season, selected_team, is_lock, result, points_earned
        ) VALUES (
            gen_random_uuid(), 
            gen_random_uuid(), 
            '81ae6301-304f-4860-a890-ac3aacf556ef',
            1, 2025, 'TEST_TEAM', false, 'win', 999
        ) RETURNING id INTO test_pick_id;
        
        can_insert := TRUE;
        RAISE NOTICE 'INSERT test: SUCCESS - can insert picks';
        
        -- Try to update the test record
        UPDATE picks 
        SET points_earned = 777 
        WHERE id = test_pick_id;
        
        can_update := TRUE;
        RAISE NOTICE 'UPDATE test: SUCCESS - can update picks';
        
        -- Clean up test record
        DELETE FROM picks WHERE id = test_pick_id;
        
    EXCEPTION 
        WHEN OTHERS THEN
            RAISE NOTICE 'Permission test FAILED: %', SQLERRM;
    END;
    
    IF NOT can_insert THEN
        RAISE NOTICE '❌ CANNOT INSERT - RLS or permissions blocking';
    END IF;
    
    IF NOT can_update THEN  
        RAISE NOTICE '❌ CANNOT UPDATE - RLS or permissions blocking';
    END IF;
    
    IF can_insert AND can_update THEN
        RAISE NOTICE '✅ Permissions OK - issue must be something else';
    END IF;
END;
$$;

-- Step 7: Show current authentication context
SELECT 
    'Database connection info:' as info,
    current_user as current_user,
    session_user as session_user,
    current_role as current_role,
    'If not service_role, RLS may block updates' as note;

-- Step 8: Final diagnostic - show exactly what's in picks table right now
SELECT 
    'FINAL DIAGNOSTIC - Current picks table state:' as info,
    game_id,
    selected_team,
    result,
    points_earned,
    updated_at,
    user_id
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
ORDER BY selected_team, user_id
LIMIT 10;

-- Step 9: Summary of possible causes
SELECT 
    'POSSIBLE CAUSES OF UPDATE FAILURE:' as diagnosis,
    '1. RLS policies blocking anonymous/service updates' as cause1,
    '2. CHECK constraints preventing result/points changes' as cause2,  
    '3. Connection using anon key instead of service key' as cause3,
    '4. Concurrent processes overriding changes' as cause4,
    '5. Database replication lag or caching issues' as cause5;