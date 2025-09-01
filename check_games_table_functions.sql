-- SQL Queries to Check Functions and Triggers on Games Table
-- Run these queries in Supabase SQL Editor to see current state

-- 1. Check all triggers currently active on the games table
SELECT 
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement,
    action_condition,
    created as created_date
FROM information_schema.triggers
WHERE event_object_table = 'games'
  AND event_object_schema = 'public'
ORDER BY action_timing, trigger_name;

-- 2. Get detailed trigger information with function names
SELECT 
    t.tgname AS trigger_name,
    c.relname AS table_name,
    p.proname AS function_name,
    pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' 
  AND c.relname = 'games'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 3. Check functions that might be called by triggers (look for game-related functions)
SELECT 
    p.proname AS function_name,
    n.nspname AS schema_name,
    pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND (
    p.proname ILIKE '%game%' 
    OR p.proname ILIKE '%pick%'
    OR p.proname ILIKE '%completion%'
    OR p.proname ILIKE '%scoring%'
  )
ORDER BY p.proname;

-- 4. Simple check - just show trigger names and when they fire
SELECT 
    trigger_name,
    event_manipulation AS fires_on,
    action_timing AS when_fires,
    CASE 
        WHEN action_condition IS NOT NULL THEN 'Conditional: ' || action_condition
        ELSE 'Always fires'
    END AS condition
FROM information_schema.triggers
WHERE event_object_table = 'games'
  AND event_object_schema = 'public'
ORDER BY action_timing, trigger_name;

-- 5. Check if Migration 109 triggers specifically exist
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE trigger_name = 'handle_game_completion_scoring_trigger'
            AND event_object_table = 'games'
        ) THEN '✅ handle_game_completion_scoring_trigger EXISTS'
        ELSE '❌ handle_game_completion_scoring_trigger MISSING'
    END AS scoring_trigger_status,
    
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE trigger_name = 'process_picks_safe_trigger'
            AND event_object_table = 'games'
        ) THEN '✅ process_picks_safe_trigger EXISTS'
        ELSE '❌ process_picks_safe_trigger MISSING'
    END AS picks_trigger_status;

-- 6. Check if key functions from Migration 109 exist
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON p.pronamespace = n.oid 
            WHERE n.nspname = 'public' AND p.proname = 'handle_game_completion_scoring_only'
        ) THEN '✅ handle_game_completion_scoring_only() function EXISTS'
        ELSE '❌ handle_game_completion_scoring_only() function MISSING'
    END AS scoring_function_status,
    
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON p.pronamespace = n.oid 
            WHERE n.nspname = 'public' AND p.proname = 'process_picks_safe_after_completion'
        ) THEN '✅ process_picks_safe_after_completion() function EXISTS'
        ELSE '❌ process_picks_safe_after_completion() function MISSING'
    END AS picks_function_status,
    
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON p.pronamespace = n.oid 
            WHERE n.nspname = 'public' AND p.proname = 'calculate_pick_results'
        ) THEN '✅ calculate_pick_results() function EXISTS'
        ELSE '❌ calculate_pick_results() function MISSING'
    END AS calc_function_status;