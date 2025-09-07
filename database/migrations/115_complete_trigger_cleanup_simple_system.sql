-- Migration 115: Complete Trigger Cleanup for Simple Time-Based System
-- 
-- GOAL: Remove ALL remaining triggers and complex functions to eliminate deadlocks
-- STRATEGY: Clean slate approach - remove everything, start fresh with simple scheduled functions

DO $$
BEGIN
    RAISE NOTICE '🧹 Migration 115: COMPLETE TRIGGER CLEANUP';
    RAISE NOTICE '===================================================';
    RAISE NOTICE 'GOAL: Remove ALL triggers and complex functions';
    RAISE NOTICE 'STRATEGY: Clean slate for simple time-based system';
    RAISE NOTICE '';
END;
$$;

-- Step 1: Drop ALL triggers on ALL tables (comprehensive cleanup)
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    RAISE NOTICE '🔥 DROPPING ALL TRIGGERS (except update_updated_at triggers)';
    
    -- Get all triggers except the basic timestamp update triggers
    FOR trigger_record IN 
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public'
        AND trigger_name NOT LIKE '%updated_at%'  -- Keep timestamp triggers
        AND trigger_name NOT LIKE 'update_%_updated_at'
    LOOP
        BEGIN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I CASCADE', 
                         trigger_record.trigger_name, 
                         trigger_record.event_object_table);
            RAISE NOTICE '  ✅ Dropped trigger: % on %', 
                       trigger_record.trigger_name, 
                       trigger_record.event_object_table;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '  ⚠️  Could not drop trigger % on %: %', 
                       trigger_record.trigger_name, 
                       trigger_record.event_object_table,
                       SQLERRM;
        END;
    END LOOP;
END;
$$;

-- Step 2: Drop ALL custom functions (except basic utilities)
DO $$
DECLARE
    func_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔥 DROPPING ALL COMPLEX FUNCTIONS';
    
    -- Get all custom functions except basic utilities
    FOR func_record IN 
        SELECT routine_name
        FROM information_schema.routines 
        WHERE routine_schema = 'public'
        AND routine_type = 'FUNCTION'
        AND routine_name NOT IN (
            'update_updated_at_column',  -- Keep timestamp function
            'gen_random_uuid'           -- Keep UUID function
        )
    LOOP
        BEGIN
            EXECUTE format('DROP FUNCTION IF EXISTS public.%I CASCADE', func_record.routine_name);
            RAISE NOTICE '  ✅ Dropped function: %', func_record.routine_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '  ⚠️  Could not drop function %: %', func_record.routine_name, SQLERRM;
        END;
    END LOOP;
END;
$$;

-- Step 3: Create simple scheduled functions (stubs for now)
RAISE NOTICE '';
RAISE NOTICE '🔧 CREATING NEW SIMPLE SCHEDULED FUNCTIONS';

-- Function 1: Live Game Updates (every 5 minutes during games)
CREATE OR REPLACE FUNCTION scheduled_live_game_updates()
RETURNS TABLE(
    games_checked INTEGER,
    games_updated INTEGER,
    newly_completed INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    checked_count INTEGER := 0;
    updated_count INTEGER := 0;
    completed_count INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '🏈 SCHEDULED LIVE UPDATES: Starting at %', CURRENT_TIMESTAMP;
    
    -- TODO: Implement CFBD API integration
    -- TODO: Update game scores and statuses  
    -- TODO: Calculate winner_against_spread for completed games
    
    RAISE NOTICE '📊 Results: % checked, % updated, % newly completed', 
                 checked_count, updated_count, completed_count;
    
    RETURN QUERY SELECT checked_count, updated_count, completed_count, error_list;
END;
$$;

-- Function 2: Pick Processing (every 10 minutes during pick windows)  
CREATE OR REPLACE FUNCTION scheduled_pick_processing()
RETURNS TABLE(
    games_processed INTEGER,
    picks_updated INTEGER,
    anonymous_picks_updated INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    processed_count INTEGER := 0;
    picks_count INTEGER := 0;
    anon_picks_count INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '🎯 SCHEDULED PICK PROCESSING: Starting at %', CURRENT_TIMESTAMP;
    
    -- TODO: Find games with winner_against_spread set but unprocessed picks
    -- TODO: Update picks table with results and points
    -- TODO: Update anonymous_picks table
    
    RAISE NOTICE '📊 Results: % games processed, % picks updated, % anonymous picks updated', 
                 processed_count, picks_count, anon_picks_count;
    
    RETURN QUERY SELECT processed_count, picks_count, anon_picks_count, error_list;
END;
$$;

-- Function 3: Game Statistics (every 30 minutes during game days)
CREATE OR REPLACE FUNCTION scheduled_game_statistics()
RETURNS TABLE(
    games_updated INTEGER,
    statistics_calculated INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    games_count INTEGER := 0;
    stats_count INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '📊 SCHEDULED GAME STATISTICS: Starting at %', CURRENT_TIMESTAMP;
    
    -- TODO: Update game-level pick counts and percentages
    -- TODO: Calculate pick distribution statistics
    -- NOTE: NO winner calculation (handled by live updates)
    
    RAISE NOTICE '📊 Results: % games updated, % statistics calculated', 
                 games_count, stats_count;
    
    RETURN QUERY SELECT games_count, stats_count, error_list;
END;
$$;

-- Function 4: Leaderboard Refresh (every 5 minutes all week)
CREATE OR REPLACE FUNCTION scheduled_leaderboard_refresh()
RETURNS TABLE(
    season_entries INTEGER,
    weekly_entries INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    season_count INTEGER := 0;
    weekly_count INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
BEGIN
    RAISE NOTICE '🏆 SCHEDULED LEADERBOARD REFRESH: Starting at %', CURRENT_TIMESTAMP;
    
    -- TODO: Refresh season_leaderboard table
    -- TODO: Refresh weekly_leaderboard tables
    -- TODO: Calculate rankings
    
    RAISE NOTICE '📊 Results: % season entries, % weekly entries', 
                 season_count, weekly_count;
    
    RETURN QUERY SELECT season_count, weekly_count, error_list;
END;
$$;

-- Step 4: Grant permissions for scheduled functions
GRANT EXECUTE ON FUNCTION scheduled_live_game_updates() TO authenticated;
GRANT EXECUTE ON FUNCTION scheduled_pick_processing() TO authenticated;
GRANT EXECUTE ON FUNCTION scheduled_game_statistics() TO authenticated;
GRANT EXECUTE ON FUNCTION scheduled_leaderboard_refresh() TO authenticated;

-- Step 5: Verify cleanup
DO $$
DECLARE
    remaining_triggers INTEGER;
    remaining_functions INTEGER;
BEGIN
    -- Count remaining triggers (excluding timestamp triggers)
    SELECT COUNT(*) INTO remaining_triggers
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    AND trigger_name NOT LIKE '%updated_at%'
    AND trigger_name NOT LIKE 'update_%_updated_at';
    
    -- Count remaining functions (excluding basic utilities and new scheduled functions)
    SELECT COUNT(*) INTO remaining_functions
    FROM information_schema.routines 
    WHERE routine_schema = 'public'
    AND routine_type = 'FUNCTION'
    AND routine_name NOT IN (
        'update_updated_at_column',
        'gen_random_uuid',
        'scheduled_live_game_updates',
        'scheduled_pick_processing', 
        'scheduled_game_statistics',
        'scheduled_leaderboard_refresh'
    );
    
    RAISE NOTICE '';
    RAISE NOTICE '🔍 CLEANUP VERIFICATION:';
    RAISE NOTICE 'Remaining problematic triggers: %', remaining_triggers;
    RAISE NOTICE 'Remaining complex functions: %', remaining_functions;
    
    IF remaining_triggers = 0 AND remaining_functions = 0 THEN
        RAISE NOTICE '✅ SUCCESS: Database completely cleaned!';
    ELSE
        RAISE NOTICE '⚠️  Some items may remain - manual cleanup may be needed';
    END IF;
END;
$$;

-- Final summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 115 COMPLETED - Database cleaned for simple system!';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 CHANGES MADE:';
    RAISE NOTICE '• Removed ALL triggers (except timestamp triggers)';
    RAISE NOTICE '• Removed ALL complex functions';
    RAISE NOTICE '• Created 4 simple scheduled function stubs';
    RAISE NOTICE '• No more database deadlocks or interdependencies';
    RAISE NOTICE '';
    RAISE NOTICE '📋 NEW SCHEDULED FUNCTIONS:';
    RAISE NOTICE '• scheduled_live_game_updates() - Game scores + completion';
    RAISE NOTICE '• scheduled_pick_processing() - Pick results + points';
    RAISE NOTICE '• scheduled_game_statistics() - Game-level statistics only';
    RAISE NOTICE '• scheduled_leaderboard_refresh() - Rankings + leaderboards';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 NEXT STEPS:';
    RAISE NOTICE '1. Implement function logic';
    RAISE NOTICE '2. Configure pg_cron schedules';
    RAISE NOTICE '3. Add admin interface buttons';
    RAISE NOTICE '4. Test each function independently';
END;
$$;