-- Migration 102: Test different PostgreSQL parameter naming formats
-- Purpose: Find what PostgreSQL actually accepts for custom parameter names

DO $$
DECLARE
    test_results TEXT := '';
    test_param TEXT;
    test_success BOOLEAN;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🧪 TESTING PostgreSQL Custom Parameter Naming Formats';
    RAISE NOTICE '====================================================';
    RAISE NOTICE '';
    
    -- Test 1: Simple words
    test_param := 'app.precedence.test';
    BEGIN
        PERFORM set_config(test_param, 'value', true);
        test_success := true;
        PERFORM set_config(test_param, NULL, true); -- cleanup
    EXCEPTION WHEN OTHERS THEN
        test_success := false;
    END;
    RAISE NOTICE 'Test 1 - Simple words (app.precedence.test): %', 
        CASE WHEN test_success THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    -- Test 2: Alphanumeric
    test_param := 'app.precedence.test123';
    BEGIN
        PERFORM set_config(test_param, 'value', true);
        test_success := true;
        PERFORM set_config(test_param, NULL, true); -- cleanup
    EXCEPTION WHEN OTHERS THEN
        test_success := false;
    END;
    RAISE NOTICE 'Test 2 - Alphanumeric (app.precedence.test123): %', 
        CASE WHEN test_success THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    -- Test 3: With underscores
    test_param := 'app.precedence.test_123';
    BEGIN
        PERFORM set_config(test_param, 'value', true);
        test_success := true;
        PERFORM set_config(test_param, NULL, true); -- cleanup
    EXCEPTION WHEN OTHERS THEN
        test_success := false;
    END;
    RAISE NOTICE 'Test 3 - With underscores (app.precedence.test_123): %', 
        CASE WHEN test_success THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    -- Test 4: Short hex (8 chars)
    test_param := 'app.precedence.abc12345';
    BEGIN
        PERFORM set_config(test_param, 'value', true);
        test_success := true;
        PERFORM set_config(test_param, NULL, true); -- cleanup
    EXCEPTION WHEN OTHERS THEN
        test_success := false;
    END;
    RAISE NOTICE 'Test 4 - Short hex (app.precedence.abc12345): %', 
        CASE WHEN test_success THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    -- Test 5: Medium hex (16 chars)
    test_param := 'app.precedence.abc123def4567890';
    BEGIN
        PERFORM set_config(test_param, 'value', true);
        test_success := true;
        PERFORM set_config(test_param, NULL, true); -- cleanup
    EXCEPTION WHEN OTHERS THEN
        test_success := false;
    END;
    RAISE NOTICE 'Test 5 - Medium hex (app.precedence.abc123def4567890): %', 
        CASE WHEN test_success THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    -- Test 6: Long hex (32 chars) - what we've been trying
    test_param := 'app.precedence.abc123def4567890123456789abcdef01';
    BEGIN
        PERFORM set_config(test_param, 'value', true);
        test_success := true;
        PERFORM set_config(test_param, NULL, true); -- cleanup
    EXCEPTION WHEN OTHERS THEN
        test_success := false;
    END;
    RAISE NOTICE 'Test 6 - Long hex 32 chars (app.precedence.abc123def4567890123456789abcdef01): %', 
        CASE WHEN test_success THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    -- Test 7: Four identifiers
    test_param := 'app.precedence.module.test';
    BEGIN
        PERFORM set_config(test_param, 'value', true);
        test_success := true;
        PERFORM set_config(test_param, NULL, true); -- cleanup
    EXCEPTION WHEN OTHERS THEN
        test_success := false;
    END;
    RAISE NOTICE 'Test 7 - Four identifiers (app.precedence.module.test): %', 
        CASE WHEN test_success THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    -- Test 8: Only letters (no numbers)
    test_param := 'app.precedence.testing';
    BEGIN
        PERFORM set_config(test_param, 'value', true);
        test_success := true;
        PERFORM set_config(test_param, NULL, true); -- cleanup
    EXCEPTION WHEN OTHERS THEN
        test_success := false;
    END;
    RAISE NOTICE 'Test 8 - Only letters (app.precedence.testing): %', 
        CASE WHEN test_success THEN '✅ PASS' ELSE '❌ FAIL' END;
    
    RAISE NOTICE '';
    RAISE NOTICE '📊 TEST COMPLETE - Check results above to determine valid format';
    RAISE NOTICE '';
    
END;
$$;