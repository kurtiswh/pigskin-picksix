-- Migration 061: Add missing home_covered and away_covered columns to games table
-- Purpose: Fix trigger errors when updating game status

-- Add the missing columns that triggers may be expecting
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS home_covered BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS away_covered BOOLEAN DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN games.home_covered IS 'Whether home team covered the spread (calculated from score vs spread)';
COMMENT ON COLUMN games.away_covered IS 'Whether away team covered the spread (calculated from score vs spread)';

-- Create function to calculate covered status based on winner_against_spread
CREATE OR REPLACE FUNCTION calculate_covered_status(
    home_team TEXT,
    away_team TEXT,
    winner_against_spread TEXT
)
RETURNS TABLE(
    home_covered BOOLEAN,
    away_covered BOOLEAN
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF winner_against_spread IS NULL THEN
        RETURN QUERY SELECT NULL::BOOLEAN, NULL::BOOLEAN;
    ELSIF winner_against_spread = 'push' THEN
        RETURN QUERY SELECT TRUE, TRUE; -- Both teams "cover" on a push
    ELSIF winner_against_spread = home_team THEN
        RETURN QUERY SELECT TRUE, FALSE;
    ELSIF winner_against_spread = away_team THEN
        RETURN QUERY SELECT FALSE, TRUE;
    ELSE
        RETURN QUERY SELECT NULL::BOOLEAN, NULL::BOOLEAN;
    END IF;
END;
$$;

-- Update existing completed games with covered status
UPDATE games 
SET (home_covered, away_covered) = (
    SELECT covered.home_covered, covered.away_covered
    FROM calculate_covered_status(home_team, away_team, winner_against_spread) AS covered
)
WHERE status = 'completed' AND winner_against_spread IS NOT NULL;

-- Create trigger to automatically update covered status when games are updated
CREATE OR REPLACE FUNCTION update_covered_status_on_game_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    covered_result RECORD;
BEGIN
    -- Calculate covered status based on winner_against_spread
    SELECT * INTO covered_result 
    FROM calculate_covered_status(NEW.home_team, NEW.away_team, NEW.winner_against_spread);
    
    -- Update the covered columns
    NEW.home_covered := covered_result.home_covered;
    NEW.away_covered := covered_result.away_covered;
    
    RETURN NEW;
END;
$$;

-- Add trigger to update covered status (runs after the winner_against_spread is calculated)
DROP TRIGGER IF EXISTS update_covered_status_trigger ON games;
CREATE TRIGGER update_covered_status_trigger
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION update_covered_status_on_game_change();

-- Create index for performance on the new columns
CREATE INDEX IF NOT EXISTS idx_games_covered_status ON games(home_covered, away_covered);

-- Log the migration
INSERT INTO schema_migrations (version, description, applied_at)
VALUES ('061', 'Add missing home_covered and away_covered columns to games table', NOW())
ON CONFLICT (version) DO NOTHING;