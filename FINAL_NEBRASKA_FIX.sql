-- FINAL FIX: Nebraska vs Cincinnati Game Status
-- Run this in Supabase Dashboard > SQL Editor
-- 
-- Problem: Game shows as "in_progress" but should be "completed"
-- Scores are already correct: Nebraska 20, Cincinnati 17
-- 
-- This SQL will execute with proper service_role permissions

UPDATE games 
SET status = 'completed'
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND status = 'in_progress';

-- Verify the fix worked
SELECT 
    away_team || ' @ ' || home_team as matchup,
    away_score || ' - ' || home_score as final_score,
    status,
    'Game should now show as FINAL on website' as result
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';