-- MINIMAL FIX: Just clear the games table first
-- This should be fast and won't timeout

UPDATE games 
SET winner_against_spread = NULL, 
    margin_bonus = NULL, 
    base_points = NULL, 
    updated_at = CURRENT_TIMESTAMP
WHERE season = 2025 
  AND week = 2 
  AND status != 'completed' 
  AND winner_against_spread IS NOT NULL;