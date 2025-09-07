-- ================================================
-- FINAL SOLUTION: Fix Iowa vs Iowa State Game
-- ================================================
-- Run this in Supabase SQL Editor
-- Copy and paste each section one at a time

-- ================================================
-- SECTION 1: List and disable all relevant triggers
-- ================================================
-- First, let's see what triggers we're dealing with
SELECT 
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    tgenabled AS is_enabled
FROM pg_trigger 
WHERE tgrelid IN ('picks'::regclass, 'games'::regclass, 'anonymous_picks'::regclass)
    AND tgisinternal = false
ORDER BY table_name, trigger_name;

-- Now disable ALL triggers on these tables
ALTER TABLE picks DISABLE TRIGGER ALL;
ALTER TABLE anonymous_picks DISABLE TRIGGER ALL;
ALTER TABLE games DISABLE TRIGGER ALL;

-- ================================================
-- SECTION 2: Clear the Iowa game data
-- ================================================
-- With triggers disabled, these should run quickly

-- Clear regular picks
UPDATE picks
SET result = NULL, 
    points_earned = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- Clear anonymous picks
UPDATE anonymous_picks
SET result = NULL,
    points_earned = NULL
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- Reset the game to scheduled
UPDATE games
SET status = 'scheduled',
    home_score = NULL,
    away_score = NULL,
    winner_against_spread = NULL,
    margin_bonus = NULL,
    base_points = NULL,
    game_period = NULL,
    game_clock = NULL,
    api_period = NULL,
    api_clock = NULL,
    api_home_points = NULL,
    api_away_points = NULL,
    api_completed = false,
    updated_at = CURRENT_TIMESTAMP
WHERE id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- ================================================
-- SECTION 3: Re-enable triggers
-- ================================================
-- IMPORTANT: Don't forget this step!
ALTER TABLE picks ENABLE TRIGGER ALL;
ALTER TABLE anonymous_picks ENABLE TRIGGER ALL;
ALTER TABLE games ENABLE TRIGGER ALL;

-- ================================================
-- SECTION 4: Verify the fix
-- ================================================
-- Check that everything is cleared
SELECT 
    'Game Status' as check_type,
    (SELECT status FROM games WHERE id = '45f22991-9bbe-4c94-b328-f91ea493ac84') as status,
    (SELECT COALESCE(home_score::text, 'NULL') || ' - ' || COALESCE(away_score::text, 'NULL') 
     FROM games WHERE id = '45f22991-9bbe-4c94-b328-f91ea493ac84') as scores
UNION ALL
SELECT 
    'Regular Picks with Results' as check_type,
    COUNT(*)::text as status,
    '' as scores
FROM picks
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
    AND result IS NOT NULL
UNION ALL
SELECT 
    'Anonymous Picks with Results' as check_type,
    COUNT(*)::text as status,
    '' as scores
FROM anonymous_picks
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
    AND result IS NOT NULL;

-- ================================================
-- SECTION 5: If you still have issues, nuclear option
-- ================================================
-- Only use this if the above doesn't work
-- This deletes ALL picks for the game (use carefully!)
/*
-- Delete approach (last resort)
DELETE FROM picks WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84';
DELETE FROM anonymous_picks WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- Then users will need to re-enter their picks
*/