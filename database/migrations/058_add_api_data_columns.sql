-- Migration 058: Add API data columns to games table
-- Purpose: Store live API data (scores, clock, period) alongside database scores

-- Add API data columns for live display
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS api_home_points INTEGER,
ADD COLUMN IF NOT EXISTS api_away_points INTEGER,
ADD COLUMN IF NOT EXISTS api_clock TEXT,
ADD COLUMN IF NOT EXISTS api_period INTEGER,
ADD COLUMN IF NOT EXISTS api_completed BOOLEAN;

-- Add comment for documentation
COMMENT ON COLUMN games.api_home_points IS 'Live home team score from CollegeFootballData API';
COMMENT ON COLUMN games.api_away_points IS 'Live away team score from CollegeFootballData API';
COMMENT ON COLUMN games.api_clock IS 'Live game clock from CollegeFootballData API (e.g., "14:23")';
COMMENT ON COLUMN games.api_period IS 'Live game period from CollegeFootballData API (1-4 for quarters)';
COMMENT ON COLUMN games.api_completed IS 'Live completion status from CollegeFootballData API';

-- Create index for efficient queries on live games
CREATE INDEX IF NOT EXISTS idx_games_api_status ON games(season, week, api_completed, status);

-- Log the migration
INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('058', 'Add API data columns to games table for live scoring', NOW())
ON CONFLICT (version) DO NOTHING;