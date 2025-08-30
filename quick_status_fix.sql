-- EMERGENCY STATUS FIX for Nebraska Game
-- This avoids heavy trigger processing by only updating the status field
-- Run this in Supabase Dashboard SQL Editor

-- Simple status-only update to avoid trigger overhead
UPDATE games 
SET status = 'completed'
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND status != 'completed';

-- Quick verification
SELECT 
    away_team || ' @ ' || home_team as game,
    away_score || ' - ' || home_score as score,
    status,
    spread
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- This should complete in under 1 second since we're not recalculating picks