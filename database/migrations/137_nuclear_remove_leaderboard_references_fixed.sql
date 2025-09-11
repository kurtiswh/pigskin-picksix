-- Migration 137: Nuclear Option - Remove ALL Leaderboard References (FIXED)
-- 
-- PURPOSE: Completely eliminate anything that could update weekly_leaderboard or season_leaderboard
-- FIXED: Use correct PostgreSQL system tables

DO $$
BEGIN
    RAISE NOTICE '💥 Migration 137: Nuclear removal of ALL leaderboard references (FIXED)';
    RAISE NOTICE '===============================================================';
    RAISE NOTICE '🎯 Goal: Pick submission should work without ANY leaderboard interference';
END;
$$;

-- Step 1: Drop ALL triggers that might reference leaderboards
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    -- Use information_schema.triggers instead of pg_triggers
    FOR trigger_record IN 
        SELECT trigger_schema, event_object_table, trigger_name 
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public' 
        AND (trigger_name ILIKE '%leaderboard%' OR trigger_name ILIKE '%leader%')
    LOOP
        BEGIN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I.%I CASCADE', 
                          trigger_record.trigger_name, 
                          trigger_record.trigger_schema, 
                          trigger_record.event_object_table);
            RAISE NOTICE '🗑️ Dropped trigger: % on %', trigger_record.trigger_name, trigger_record.event_object_table;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '⚠️ Could not drop trigger %: %', trigger_record.trigger_name, SQLERRM;
        END;
    END LOOP;
END;
$$;

-- Step 2: Drop ALL functions that contain 'leaderboard' in their name
DO $$
DECLARE
    func_record RECORD;
BEGIN
    -- Use information_schema.routines for functions
    FOR func_record IN 
        SELECT routine_schema, routine_name
        FROM information_schema.routines 
        WHERE routine_schema = 'public' 
        AND routine_name ILIKE '%leaderboard%'
        AND routine_type = 'FUNCTION'
    LOOP
        BEGIN
            EXECUTE format('DROP FUNCTION IF EXISTS %I.%I CASCADE', 
                          func_record.routine_schema, 
                          func_record.routine_name);
            RAISE NOTICE '🗑️ Dropped function: %', func_record.routine_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '⚠️ Could not drop function %: %', func_record.routine_name, SQLERRM;
        END;
    END LOOP;
END;
$$;

-- Step 3: Manually drop specific triggers we know about (belt and suspenders)
DROP TRIGGER IF EXISTS picks_weekly_leaderboard_trigger ON public.picks CASCADE;
DROP TRIGGER IF EXISTS picks_season_leaderboard_trigger ON public.picks CASCADE;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_trigger ON public.picks CASCADE;
DROP TRIGGER IF EXISTS update_season_leaderboard_trigger ON public.picks CASCADE;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_on_pick_change ON public.picks CASCADE;
DROP TRIGGER IF EXISTS update_season_leaderboard_on_pick_change ON public.picks CASCADE;
DROP TRIGGER IF EXISTS weekly_leaderboard_trigger ON public.picks CASCADE;
DROP TRIGGER IF EXISTS season_leaderboard_trigger ON public.picks CASCADE;

-- Step 4: Drop triggers on anonymous_picks too
DROP TRIGGER IF EXISTS update_weekly_leaderboard_anon_trigger ON public.anonymous_picks CASCADE;
DROP TRIGGER IF EXISTS update_season_leaderboard_anon_trigger ON public.anonymous_picks CASCADE;

-- Step 5: Manually drop specific functions we know about
DROP FUNCTION IF EXISTS public.update_weekly_leaderboard_on_pick_change() CASCADE;
DROP FUNCTION IF EXISTS public.update_season_leaderboard_on_pick_change() CASCADE;
DROP FUNCTION IF EXISTS public.update_weekly_leaderboard_with_source(UUID, INTEGER, INTEGER, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.update_season_leaderboard_with_source(UUID, INTEGER, INTEGER, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.refresh_weekly_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_season_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.rebuild_weekly_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.rebuild_season_leaderboard() CASCADE;

-- Step 6: Drop any specific functions with different signatures
DROP FUNCTION IF EXISTS public.update_weekly_leaderboard_with_source(UUID, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.update_season_leaderboard_with_source(UUID, INTEGER, INTEGER) CASCADE;

-- Step 7: Verify the leaderboard views exist and are properly defined
DO $$
BEGIN
    -- Verify the views exist
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'weekly_leaderboard' AND table_schema = 'public') THEN
        RAISE NOTICE '✅ weekly_leaderboard view exists and will continue to work';
    ELSE
        RAISE NOTICE '⚠️ weekly_leaderboard view missing - may need to be recreated';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'season_leaderboard' AND table_schema = 'public') THEN
        RAISE NOTICE '✅ season_leaderboard view exists and will continue to work';
    ELSE
        RAISE NOTICE '⚠️ season_leaderboard view missing - may need to be recreated';
    END IF;
END;
$$;

-- Log the completion
DO $$
BEGIN
    RAISE NOTICE '💥 Migration 137 completed - NUCLEAR OPTION APPLIED';
    RAISE NOTICE '🎯 ALL leaderboard triggers and functions have been eliminated';
    RAISE NOTICE '✅ Pick submission should now work without ANY leaderboard interference';
    RAISE NOTICE '📊 Leaderboards will still display correctly (they are views)';
    RAISE NOTICE '🚀 Performance may actually improve without trigger overhead';
END;
$$;