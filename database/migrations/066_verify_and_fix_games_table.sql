-- Check and fix the games table for Nebraska vs Cincinnati
-- The validation is still showing Nebraska as wins because the games table wasn't updated correctly

-- Step 1: Check current state of the Nebraska game
SELECT 
    'Current Nebraska Game State' as description,
    away_team || ' @ ' || home_team as matchup,
    away_score || ' - ' || home_score as final_score,
    spread,
    winner_against_spread,
    base_points,
    margin_bonus,
    status
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 2: Fix the games table - Nebraska was favored by 6.5, only won by 3
-- Cincinnati should be the ATS winner
UPDATE games 
SET 
    winner_against_spread = 'CINCINNATI',
    status = 'completed',
    base_points = 20,
    margin_bonus = 0  -- Cincinnati cover margin was only 3.5 points (no bonus)
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 3: Verify the games table is now correct
SELECT 
    'Updated Nebraska Game State' as description,
    away_team || ' @ ' || home_team as matchup,
    away_score || ' - ' || home_score as final_score,
    spread,
    winner_against_spread,
    base_points,
    margin_bonus,
    status,
    CASE 
        WHEN winner_against_spread = 'CINCINNATI' THEN '✅ Cincinnati correctly set as ATS winner'
        ELSE '❌ Still incorrect'
    END as verification
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 4: Now update picks to match the corrected games table
-- Temporarily disable triggers
ALTER TABLE picks DISABLE TRIGGER update_weekly_leaderboard_trigger;
ALTER TABLE picks DISABLE TRIGGER update_season_leaderboard_trigger;

-- Cincinnati picks should WIN (match winner_against_spread)
UPDATE picks 
SET 
    result = 'win',
    points_earned = 20,  -- base_points (20) + margin_bonus (0) = 20 points
    updated_at = NOW()
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'CINCINNATI';

-- Nebraska picks should LOSE (don't match winner_against_spread)  
UPDATE picks 
SET 
    result = 'loss',
    points_earned = 0,
    updated_at = NOW()
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'NEBRASKA';

-- Re-enable triggers
ALTER TABLE picks ENABLE TRIGGER update_weekly_leaderboard_trigger;
ALTER TABLE picks ENABLE TRIGGER update_season_leaderboard_trigger;

-- Step 5: Final verification - picks should now match games table
WITH game_info AS (
    SELECT 
        winner_against_spread,
        base_points,
        margin_bonus
    FROM games 
    WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef'
)
SELECT 
    'Final Pick Verification' as description,
    p.selected_team,
    COUNT(*) as pick_count,
    p.result as current_result,
    p.points_earned as current_points,
    -- What it should be based on games table
    CASE 
        WHEN p.selected_team = gi.winner_against_spread THEN 'win'
        WHEN gi.winner_against_spread = 'push' THEN 'push'
        ELSE 'loss'
    END as expected_result,
    gi.base_points + gi.margin_bonus as expected_points,
    -- Final validation
    CASE 
        WHEN p.selected_team = 'CINCINNATI' AND p.result = 'win' AND p.points_earned = 20 THEN '✅ CORRECT - Cincinnati wins ATS'
        WHEN p.selected_team = 'NEBRASKA' AND p.result = 'loss' AND p.points_earned = 0 THEN '✅ CORRECT - Nebraska loses ATS'
        ELSE '❌ STILL WRONG'
    END as final_validation
FROM picks p
CROSS JOIN game_info gi
WHERE p.game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY p.selected_team, p.result, p.points_earned, gi.winner_against_spread, gi.base_points, gi.margin_bonus
ORDER BY p.selected_team;

-- Step 6: Force leaderboard recalculation
UPDATE picks 
SET updated_at = NOW() 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 7: Show summary
SELECT 
    '🎯 Nebraska ATS Fix Summary' as summary,
    'Game: Nebraska 20 - Cincinnati 17' as game_result,
    'Spread: Nebraska -6.5' as spread_info,
    'ATS Result: Cincinnati wins (Nebraska failed to cover 6.5)' as ats_result,
    'Cincinnati picks: WIN (20 points)' as cincinnati_outcome,
    'Nebraska picks: LOSS (0 points)' as nebraska_outcome;