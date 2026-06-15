-- Fix Iowa vs Iowa State game picks
-- Process in smaller batches to avoid timeouts

-- First, let's check how many picks we're dealing with
SELECT COUNT(*) as total_picks
FROM picks
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
  AND season = 2025
  AND week = 2;

-- Clear picks in batches (run each separately if needed)
-- Batch 1: First 50 picks
UPDATE picks
SET result = NULL, 
    points_earned = NULL, 
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT id FROM picks
  WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
    AND season = 2025
    AND week = 2
  LIMIT 50
);

-- Batch 2: Next 50 picks
UPDATE picks
SET result = NULL, 
    points_earned = NULL, 
    updated_at = CURRENT_TIMESTAMP
WHERE id IN (
  SELECT id FROM picks
  WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
    AND season = 2025
    AND week = 2
    AND result IS NOT NULL
  LIMIT 50
);

-- Continue with more batches if needed...

-- Alternative: Clear by selected team (usually fewer records per query)
-- Clear Iowa picks
UPDATE picks
SET result = NULL, 
    points_earned = NULL, 
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
  AND selected_team = 'Iowa'
  AND season = 2025
  AND week = 2;

-- Clear Iowa State picks
UPDATE picks
SET result = NULL, 
    points_earned = NULL, 
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
  AND selected_team = 'Iowa State'
  AND season = 2025
  AND week = 2;

-- Also clear anonymous picks for this game
UPDATE anonymous_picks
SET result = NULL,
    points_earned = NULL
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84';

-- Finally, reset the game status if needed
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

-- Verify the fixes
SELECT 
  'Regular Picks' as type,
  COUNT(*) as total,
  SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as with_results,
  SUM(CASE WHEN result IS NULL THEN 1 ELSE 0 END) as cleared
FROM picks
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84'
UNION ALL
SELECT 
  'Anonymous Picks' as type,
  COUNT(*) as total,
  SUM(CASE WHEN result IS NOT NULL THEN 1 ELSE 0 END) as with_results,
  SUM(CASE WHEN result IS NULL THEN 1 ELSE 0 END) as cleared
FROM anonymous_picks
WHERE game_id = '45f22991-9bbe-4c94-b328-f91ea493ac84';