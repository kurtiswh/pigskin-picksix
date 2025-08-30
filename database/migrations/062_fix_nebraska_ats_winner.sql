-- Fix Nebraska vs Cincinnati ATS winner and recalculate picks
-- Nebraska was favored by 6.5, only won by 3, so Cincinnati should be ATS winner

-- Step 1: Update the games table with correct ATS winner
UPDATE games 
SET 
  winner_against_spread = 'CINCINNATI',
  status = 'completed'
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 2: Recalculate all picks for this game with correct ATS logic
-- Nebraska picks should be LOSSES (Nebraska didn't cover 6.5 spread)
UPDATE picks 
SET 
  result = 'loss',
  points_earned = 0,
  updated_at = NOW()
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'NEBRASKA';

-- Cincinnati picks should be WINS (Cincinnati covered as +6.5 underdog)
UPDATE picks 
SET 
  result = 'win',
  points_earned = CASE 
    WHEN is_lock = true THEN 20  -- Base points for win, no bonus since cover margin is only 3.5
    ELSE 20
  END,
  updated_at = NOW()
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'CINCINNATI';

-- Step 3: Verify the corrections
SELECT 
  'Nebraska vs Cincinnati ATS Fix Results' as description,
  away_team || ' @ ' || home_team as matchup,
  away_score || ' - ' || home_score as final_score,
  'Nebraska -' || ABS(spread) as betting_line,
  winner_against_spread as ats_winner,
  status,
  CASE 
    WHEN winner_against_spread = 'CINCINNATI' THEN '✅ Cincinnati correctly set as ATS winner'
    ELSE '❌ ATS winner still incorrect'
  END as fix_status
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 4: Show updated pick results
SELECT 
  selected_team,
  COUNT(*) as pick_count,
  result,
  points_earned,
  CASE 
    WHEN selected_team = 'CINCINNATI' AND result = 'win' THEN '✅ Correct - Cincinnati covered'
    WHEN selected_team = 'NEBRASKA' AND result = 'loss' THEN '✅ Correct - Nebraska failed to cover'
    ELSE '❌ Still incorrect'
  END as validation
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team, result;