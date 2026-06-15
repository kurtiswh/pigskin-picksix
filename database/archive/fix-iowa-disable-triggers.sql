-- Fix Iowa vs Iowa State game by temporarily disabling triggers
-- Run this in Supabase SQL Editor

-- Step 1: Disable triggers on picks table
ALTER TABLE picks DISABLE TRIGGER ALL;
ALTER TABLE anonymous_picks DISABLE TRIGGER ALL;
ALTER TABLE games DISABLE TRIGGER ALL;

-- Step 2: Clear all picks for the Iowa game (should be fast now)
UPDATE picks
SET result = NULL, 
    points_earned = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- Step 3: Clear anonymous picks
UPDATE anonymous_picks
SET result = NULL,
    points_earned = NULL
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- Step 4: Reset the game to scheduled
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

-- Step 5: Re-enable triggers
ALTER TABLE picks ENABLE TRIGGER ALL;
ALTER TABLE anonymous_picks ENABLE TRIGGER ALL;
ALTER TABLE games ENABLE TRIGGER ALL;

-- Step 6: Verify the fix
SELECT 
  'Game Status' as check_type,
  COUNT(*) as count,
  STRING_AGG(DISTINCT status, ', ') as values
FROM games
WHERE id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
UNION ALL
SELECT 
  'Picks with Results' as check_type,
  COUNT(*) as count,
  STRING_AGG(DISTINCT result, ', ') as values
FROM picks
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
  AND result IS NOT NULL
UNION ALL
SELECT 
  'Anonymous Picks with Results' as check_type,
  COUNT(*) as count,
  STRING_AGG(DISTINCT result, ', ') as values
FROM anonymous_picks
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
  AND result IS NOT NULL;