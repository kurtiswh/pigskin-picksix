-- Migration 077: Add live game data columns (clean version without dummy data)
-- Purpose: Ensure live game clock/quarter columns exist for real CFBD scoreboard data

-- Add API data columns for live display (if they don't exist)
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS api_home_points INTEGER,
ADD COLUMN IF NOT EXISTS api_away_points INTEGER,
ADD COLUMN IF NOT EXISTS api_clock TEXT,
ADD COLUMN IF NOT EXISTS api_period INTEGER,
ADD COLUMN IF NOT EXISTS api_completed BOOLEAN DEFAULT FALSE;

-- Add game timing columns (if they don't exist) 
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS game_period INTEGER,
ADD COLUMN IF NOT EXISTS game_clock TEXT;

-- Add comments for documentation
COMMENT ON COLUMN games.api_home_points IS 'Live home team score from CollegeFootballData API';
COMMENT ON COLUMN games.api_away_points IS 'Live away team score from CollegeFootballData API';
COMMENT ON COLUMN games.api_clock IS 'Live game clock from API (e.g., "14:23")';
COMMENT ON COLUMN games.api_period IS 'Live game period from API (1-4 for quarters)';
COMMENT ON COLUMN games.api_completed IS 'Live completion status from API';
COMMENT ON COLUMN games.game_period IS 'Current game period/quarter (1-4)';
COMMENT ON COLUMN games.game_clock IS 'Game clock time (e.g., "14:23")';

-- Create indexes for efficient queries on live games
CREATE INDEX IF NOT EXISTS idx_games_api_status ON games(season, week, api_completed, status);
CREATE INDEX IF NOT EXISTS idx_games_live_status ON games(season, week, status, game_period);

-- Verify the columns exist
SELECT 
    'Live game columns added successfully' as summary,
    'Ready for CFBD scoreboard API integration' as status;