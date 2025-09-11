-- Fix games that were marked complete without proper scores
-- This resets them so CFBD can properly update them

-- First, let's see which games have issues
SELECT 
    id,
    away_team || ' @ ' || home_team as game,
    status,
    away_score || '-' || home_score as score,
    winner_against_spread,
    week,
    season
FROM games
WHERE status = 'completed'
AND (
    -- Games marked complete with 0-0 scores (likely marked by time)
    (home_score = 0 AND away_score = 0) OR
    -- Games marked complete without any scores
    home_score IS NULL OR 
    away_score IS NULL OR
    -- Games marked complete without winner calculation
    (winner_against_spread IS NULL AND home_score IS NOT NULL AND away_score IS NOT NULL)
)
ORDER BY week DESC, home_team;

-- Fix these games by resetting their status so CFBD can update them properly
UPDATE games
SET 
    status = 'in_progress',
    winner_against_spread = NULL,
    margin_bonus = NULL,
    base_points = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'completed'
AND (
    -- Games with suspicious 0-0 scores
    (home_score = 0 AND away_score = 0) OR
    -- Games without scores
    home_score IS NULL OR 
    away_score IS NULL
)
RETURNING 
    id,
    away_team || ' @ ' || home_team as game,
    'Reset to in_progress for CFBD update' as action;

-- Also reset games that are completed but missing winner calculations
-- These might have been marked complete before winner calc was added
UPDATE games
SET 
    status = 'in_progress',
    updated_at = CURRENT_TIMESTAMP
WHERE status = 'completed'
AND winner_against_spread IS NULL
AND home_score IS NOT NULL 
AND away_score IS NOT NULL
RETURNING 
    id,
    away_team || ' @ ' || home_team as game,
    away_score || '-' || home_score as score,
    'Reset completed game without winner for recalculation' as action;