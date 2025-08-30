-- Fix Nebraska picks with correct SQL syntax
-- This replaces Step 7 from migration 064

-- Step 1: Temporarily disable triggers to prevent multiple recalculations
ALTER TABLE picks DISABLE TRIGGER update_weekly_leaderboard_trigger;
ALTER TABLE picks DISABLE TRIGGER update_season_leaderboard_trigger;

-- Step 2: Update Nebraska picks - Cincinnati should win, Nebraska should lose
-- Cincinnati picks: WIN (20 base points + 0 margin bonus + 0 lock bonus = 20 points)
UPDATE picks 
SET 
    result = 'win',
    points_earned = 20, -- base_points + margin_bonus (0) + lock bonus (0 since margin_bonus is 0)
    updated_at = NOW()
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'CINCINNATI';

-- Nebraska picks: LOSS (0 points)
UPDATE picks 
SET 
    result = 'loss',
    points_earned = 0,
    updated_at = NOW()
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'NEBRASKA';

-- Step 3: Re-enable triggers
ALTER TABLE picks ENABLE TRIGGER update_weekly_leaderboard_trigger;
ALTER TABLE picks ENABLE TRIGGER update_season_leaderboard_trigger;

-- Step 4: Force trigger recalculation for all affected users
DO $$
DECLARE
    affected_user RECORD;
    pick_id_to_update UUID;
BEGIN
    -- Get all users who had picks in the Nebraska game
    FOR affected_user IN 
        SELECT DISTINCT user_id, week, season 
        FROM picks 
        WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
    LOOP
        -- Get one pick ID for this user to trigger recalculation
        SELECT id INTO pick_id_to_update
        FROM picks 
        WHERE user_id = affected_user.user_id 
          AND week = affected_user.week 
          AND season = affected_user.season
          AND game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
        LIMIT 1;
        
        -- Trigger recalculation by updating that specific pick
        IF pick_id_to_update IS NOT NULL THEN
            UPDATE picks 
            SET updated_at = NOW() 
            WHERE id = pick_id_to_update;
        END IF;
    END LOOP;
END;
$$;

-- Step 5: Verification - check that picks match the games table calculation
WITH game_info AS (
    SELECT 
        winner_against_spread,
        base_points,
        margin_bonus
    FROM games 
    WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef'
)
SELECT 
    p.selected_team,
    COUNT(*) as pick_count,
    p.result as actual_result,
    p.points_earned as actual_points,
    -- What the result SHOULD be based on games table
    CASE 
        WHEN p.selected_team = gi.winner_against_spread THEN 'win'
        WHEN gi.winner_against_spread = 'push' THEN 'push'
        ELSE 'loss'
    END as expected_result,
    -- What the points SHOULD be based on games table
    CASE 
        WHEN p.selected_team = gi.winner_against_spread THEN 
            gi.base_points + gi.margin_bonus + CASE WHEN p.is_lock THEN gi.margin_bonus ELSE 0 END
        WHEN gi.winner_against_spread = 'push' THEN 10
        ELSE 0
    END as expected_points,
    -- Validation
    CASE 
        WHEN p.selected_team = 'CINCINNATI' AND p.result = 'win' AND p.points_earned = 20 THEN '✅ Correct'
        WHEN p.selected_team = 'NEBRASKA' AND p.result = 'loss' AND p.points_earned = 0 THEN '✅ Correct'
        ELSE '❌ Incorrect'
    END as validation
FROM picks p
CROSS JOIN game_info gi
WHERE p.game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY p.selected_team, p.result, p.points_earned, p.is_lock, gi.winner_against_spread, gi.base_points, gi.margin_bonus
ORDER BY p.selected_team;