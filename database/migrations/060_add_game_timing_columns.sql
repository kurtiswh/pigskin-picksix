-- Migration 060: Add Game Timing Columns
-- Purpose: Add columns to store quarter and clock information for live games

-- Add timing columns to games table
ALTER TABLE games 
ADD COLUMN game_period INTEGER,
ADD COLUMN game_clock TEXT,
ADD COLUMN api_period INTEGER,
ADD COLUMN api_clock TEXT,
ADD COLUMN api_completed BOOLEAN DEFAULT FALSE;

-- Add comment for documentation
COMMENT ON COLUMN games.game_period IS 'Current game period/quarter (1-4)';
COMMENT ON COLUMN games.game_clock IS 'Game clock time (e.g., "14:23")';
COMMENT ON COLUMN games.api_period IS 'API period/quarter data';
COMMENT ON COLUMN games.api_clock IS 'API clock time data';
COMMENT ON COLUMN games.api_completed IS 'API game completion status';

-- Update Nebraska @ Cincinnati game with sample live timing data for testing
UPDATE games 
SET 
  game_period = 4,
  game_clock = '8:42',
  api_period = 4,
  api_clock = '8:42',
  api_completed = false
WHERE season = 2025 
  AND week = 1 
  AND home_team = 'Cincinnati' 
  AND away_team = 'Nebraska' 
  AND status = 'in_progress';