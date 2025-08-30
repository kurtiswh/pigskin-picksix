-- FINAL FIX: Nebraska ATS Scoring (Run in Supabase Dashboard with service_role)
-- This must be run in Supabase Dashboard SQL Editor to bypass RLS policies
-- Game: Nebraska 20 - Cincinnati 17, Spread: Nebraska -6.5
-- ATS Winner: Cincinnati (Nebraska failed to cover 6.5 point spread)

-- Step 1: Verify current game state
SELECT 
    'Current Game State' as info,
    away_team || ' @ ' || home_team as matchup,
    away_score || ' - ' || home_score as final_score,
    spread,
    winner_against_spread,
    base_points,
    margin_bonus,
    status
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 2: Ensure games table is correct (Cincinnati should be ATS winner)
UPDATE games 
SET 
    winner_against_spread = 'CINCINNATI',
    status = 'completed',
    base_points = 20,
    margin_bonus = 0
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 3: Check current wrong picks state
SELECT 
    'BEFORE FIX - Current picks state:' as info,
    selected_team,
    COUNT(*) as pick_count,
    result,
    points_earned,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' THEN '✅ Already correct'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' THEN '✅ Already correct'
        ELSE '❌ NEEDS FIXING'
    END as status
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;

-- Step 4: Disable triggers to prevent interference
ALTER TABLE picks DISABLE TRIGGER ALL;

-- Step 5: Fix Cincinnati picks (should WIN with 20 points)
UPDATE picks 
SET 
    result = 'win'::pick_result,
    points_earned = 20,
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'CINCINNATI';

-- Step 6: Fix Nebraska picks (should LOSE with 0 points)
UPDATE picks 
SET 
    result = 'loss'::pick_result,
    points_earned = 0,
    updated_at = CURRENT_TIMESTAMP
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'NEBRASKA';

-- Step 7: Re-enable triggers
ALTER TABLE picks ENABLE TRIGGER ALL;

-- Step 8: IMMEDIATE VERIFICATION (this should show correct results)
SELECT 
    'AFTER FIX - Picks should now be correct:' as info,
    selected_team,
    COUNT(*) as pick_count,
    result,
    points_earned,
    CASE 
        WHEN selected_team = 'CINCINNATI' AND result = 'win' AND points_earned = 20 THEN '✅ FIXED - Cincinnati wins ATS'
        WHEN selected_team = 'NEBRASKA' AND result = 'loss' AND points_earned = 0 THEN '✅ FIXED - Nebraska loses ATS'
        ELSE '❌ STILL BROKEN - ' || selected_team || ' shows ' || result::text || ' (' || points_earned || ' pts)'
    END as final_status
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team;

-- Step 9: Force leaderboard recalculation by updating affected users
UPDATE picks 
SET updated_at = CURRENT_TIMESTAMP 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 10: Final success confirmation
SELECT 
    '🎯 NEBRASKA ATS FIX COMPLETE' as status,
    'Game: Nebraska 20 - Cincinnati 17 (Spread: -6.5)' as game_details,
    'ATS Winner: Cincinnati (Nebraska failed to cover)' as ats_result,
    'Cincinnati picks: WIN (20 points)' as cincinnati_result,
    'Nebraska picks: LOSS (0 points)' as nebraska_result,
    'This fix uses service_role to bypass RLS policies' as technical_note;