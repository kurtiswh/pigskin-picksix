-- ================================================
-- FIXED SOLUTION: Fix Iowa vs Iowa State Game
-- Only disables USER triggers, not system triggers
-- ================================================
-- Run this in Supabase SQL Editor
-- Copy and paste each section one at a time

-- ================================================
-- SECTION 1: List USER triggers (not system triggers)
-- ================================================
SELECT 
    tgname AS trigger_name,
    tgrelid::regclass AS table_name,
    tgenabled AS is_enabled
FROM pg_trigger 
WHERE tgrelid IN ('picks'::regclass, 'games'::regclass, 'anonymous_picks'::regclass)
    AND NOT tgisinternal  -- Exclude system triggers
    AND tgname NOT LIKE 'RI_ConstraintTrigger%'  -- Exclude foreign key triggers
ORDER BY table_name, trigger_name;

-- ================================================
-- SECTION 2: Disable only USER triggers
-- ================================================
-- Disable user triggers on picks table
ALTER TABLE picks DISABLE TRIGGER USER;

-- Disable user triggers on anonymous_picks table  
ALTER TABLE anonymous_picks DISABLE TRIGGER USER;

-- Disable user triggers on games table
ALTER TABLE games DISABLE TRIGGER USER;

-- ================================================
-- SECTION 3: Clear the Iowa game data
-- ================================================
-- With user triggers disabled, these should run without deadlocks

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
-- SECTION 4: Re-enable USER triggers
-- ================================================
-- IMPORTANT: Don't forget this step!
ALTER TABLE picks ENABLE TRIGGER USER;
ALTER TABLE anonymous_picks ENABLE TRIGGER USER;
ALTER TABLE games ENABLE TRIGGER USER;

-- ================================================
-- SECTION 5: Verify the fix
-- ================================================
-- Check that everything is cleared
SELECT 
    'Game Status' as check_type,
    (SELECT status FROM games WHERE id = '45f22991-9bbe-4c94-b328-f91ea493ac84') as value,
    (SELECT COALESCE(home_score::text, 'NULL') || ' - ' || COALESCE(away_score::text, 'NULL') 
     FROM games WHERE id = '45f22991-9bbe-4c94-b328-f91ea493ac84') as scores
UNION ALL
SELECT 
    'Regular Picks with Results' as check_type,
    COUNT(*)::text as value,
    'Should be 0' as scores
FROM picks
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
    AND result IS NOT NULL
UNION ALL
SELECT 
    'Anonymous Picks with Results' as check_type,
    COUNT(*)::text as value,
    'Should be 0' as scores
FROM anonymous_picks
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
    AND result IS NOT NULL;

-- ================================================
-- SECTION 6: Alternative - Disable specific triggers
-- ================================================
-- If the above still has issues, disable triggers one by one
/*
-- List of specific triggers to disable/enable
-- Run these if needed:

-- Disable specific triggers on games table
ALTER TABLE games DISABLE TRIGGER handle_game_completion_scoring_trigger;
ALTER TABLE games DISABLE TRIGGER process_picks_notification_trigger;
ALTER TABLE games DISABLE TRIGGER process_picks_safe_trigger;
ALTER TABLE games DISABLE TRIGGER update_game_completion_trigger;
ALTER TABLE games DISABLE TRIGGER update_picks_after_completion_trigger;
ALTER TABLE games DISABLE TRIGGER update_game_completion_ultra_minimal_trigger;
ALTER TABLE games DISABLE TRIGGER recalculate_pick_points_trigger;
ALTER TABLE games DISABLE TRIGGER update_game_winner_scoring_trigger;
ALTER TABLE games DISABLE TRIGGER update_covered_status_trigger;

-- Disable specific triggers on picks table
ALTER TABLE picks DISABLE TRIGGER validate_pick_constraints_trigger;
ALTER TABLE picks DISABLE TRIGGER update_picks_updated_at;
ALTER TABLE picks DISABLE TRIGGER enforce_picks_limit;
ALTER TABLE picks DISABLE TRIGGER manage_pick_precedence_on_picks;

-- Run your updates here...

-- Re-enable all the triggers
ALTER TABLE games ENABLE TRIGGER handle_game_completion_scoring_trigger;
ALTER TABLE games ENABLE TRIGGER process_picks_notification_trigger;
ALTER TABLE games ENABLE TRIGGER process_picks_safe_trigger;
ALTER TABLE games ENABLE TRIGGER update_game_completion_trigger;
ALTER TABLE games ENABLE TRIGGER update_picks_after_completion_trigger;
ALTER TABLE games ENABLE TRIGGER update_game_completion_ultra_minimal_trigger;
ALTER TABLE games ENABLE TRIGGER recalculate_pick_points_trigger;
ALTER TABLE games ENABLE TRIGGER update_game_winner_scoring_trigger;
ALTER TABLE games ENABLE TRIGGER update_covered_status_trigger;

ALTER TABLE picks ENABLE TRIGGER validate_pick_constraints_trigger;
ALTER TABLE picks ENABLE TRIGGER update_picks_updated_at;
ALTER TABLE picks ENABLE TRIGGER enforce_picks_limit;
ALTER TABLE picks ENABLE TRIGGER manage_pick_precedence_on_picks;
*/