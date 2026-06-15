-- Update Nebraska vs Cincinnati game to completed status
-- Game ID: 81ae6301-304f-4860-a890-ac3aacf556ef
-- Final Score: Nebraska 20, Cincinnati 17

UPDATE games 
SET 
    status = 'completed',
    home_score = 17,
    away_score = 20
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Verify the update
SELECT 
    id,
    home_team,
    away_team, 
    home_score,
    away_score,
    status,
    kickoff_time
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';