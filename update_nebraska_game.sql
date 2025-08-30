-- Direct SQL commands to fix the missing column issue and update the game status
-- Run these commands in Supabase Dashboard > SQL Editor

-- Step 1: Add missing columns that may be causing trigger errors
ALTER TABLE games 
ADD COLUMN IF NOT EXISTS home_covered BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS away_covered BOOLEAN DEFAULT NULL;

-- Step 2: Update the specific game status to completed
UPDATE games 
SET status = 'completed'
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 3: Verify the update worked
SELECT 
    id,
    home_team,
    away_team,
    home_score,
    away_score,
    status,
    winner_against_spread,
    home_covered,
    away_covered
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';