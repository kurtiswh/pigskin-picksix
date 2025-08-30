-- Emergency fix for Nebraska game status without triggering complex triggers
-- This bypasses potential trigger issues by doing a simple status-only update

BEGIN;

-- First, try just updating the status field only
UPDATE games 
SET status = 'completed'
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND status = 'in_progress';

-- Verify the change
SELECT 
    id,
    home_team || ' vs ' || away_team as matchup,
    home_score,
    away_score, 
    status,
    CASE 
        WHEN status = 'completed' THEN '✅ Fixed'
        ELSE '❌ Still needs fixing'
    END as fix_status
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

COMMIT;