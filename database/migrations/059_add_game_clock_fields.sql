-- Add game clock and quarter fields to games table
-- Migration 059: Add Game Clock Fields

ALTER TABLE games 
ADD COLUMN game_period INTEGER,
ADD COLUMN game_clock TEXT;

-- Update Nebraska @ Cincinnati with real clock data
UPDATE games 
SET 
  game_period = 4,
  game_clock = '8:42',
  updated_at = NOW()
WHERE 
  season = 2025 
  AND week = 1 
  AND home_team = 'Cincinnati' 
  AND away_team = 'Nebraska';