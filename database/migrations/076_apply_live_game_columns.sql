-- Migration 076: Apply live game data columns and test data
-- Purpose: Ensure live game clock/quarter columns exist and add test data

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

-- Add some test live games for today (adjust teams as needed)
INSERT INTO games (
    week, season, home_team, away_team, spread, kickoff_time, 
    status, home_score, away_score, game_period, game_clock
) VALUES 
(1, 2025, 'Colorado', 'Georgia Tech', 4.5, NOW() - INTERVAL '2 hours', 'in_progress', 14, 17, 3, '12:45'),
(1, 2025, 'Baylor', 'Auburn', -2.5, NOW() - INTERVAL '2 hours', 'in_progress', 21, 14, 3, '8:32')
ON CONFLICT (week, season, home_team, away_team) 
DO UPDATE SET 
    status = EXCLUDED.status,
    home_score = EXCLUDED.home_score,
    away_score = EXCLUDED.away_score,
    game_period = EXCLUDED.game_period,
    game_clock = EXCLUDED.game_clock,
    updated_at = NOW();

-- Update existing Nebraska game to show as live for testing
UPDATE games 
SET 
    status = 'in_progress',
    home_score = 17,
    away_score = 20,
    game_period = 4,
    game_clock = '2:45',
    api_period = 4,
    api_clock = '2:45',
    api_home_points = 17,
    api_away_points = 20,
    api_completed = false,
    updated_at = NOW()
WHERE season = 2025 
  AND week = 1 
  AND home_team = 'Cincinnati' 
  AND away_team = 'Nebraska';

-- Verify the live games setup
SELECT 
    'Live games after migration:' as info,
    home_team,
    away_team,
    home_score || ' - ' || away_score as score,
    status,
    'Q' || game_period as quarter,
    game_clock as time_left,
    'Should show as live on games page' as note
FROM games 
WHERE status = 'in_progress' 
  AND season = 2025 
  AND week = 1
ORDER BY kickoff_time;

-- Summary
SELECT 
    'Live Game Setup Complete' as summary,
    COUNT(*) as live_games_count,
    'Games should now show quarter and time on games page' as result
FROM games 
WHERE status = 'in_progress' 
  AND season = 2025 
  AND week = 1;