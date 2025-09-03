-- Direct SQL to fix the remaining picks for TCU vs North Carolina game
-- Run this AFTER applying Migration 116 to disable triggers

-- First, let's see what picks need fixing
SELECT 
    p.id,
    p.selected_team,
    p.is_lock,
    g.away_team,
    g.home_team,
    g.away_score,
    g.home_score,
    g.winner_against_spread,
    g.margin_bonus
FROM picks p
JOIN games g ON p.game_id = g.id
WHERE p.result IS NULL
  AND g.status = 'completed'
  AND g.home_score IS NOT NULL
  AND g.away_score IS NOT NULL;

-- Update the remaining picks directly (assuming TCU @ North Carolina)
-- North Carolina won ATS with margin bonus of 5

UPDATE picks 
SET 
    result = CASE 
        WHEN selected_team = g.winner_against_spread THEN 'win'::pick_result
        WHEN g.winner_against_spread = 'push' THEN 'push'::pick_result
        ELSE 'loss'::pick_result
    END,
    points_earned = CASE 
        WHEN selected_team = g.winner_against_spread THEN 
            20 + COALESCE(g.margin_bonus, 0) + 
            CASE WHEN is_lock THEN COALESCE(g.margin_bonus, 0) ELSE 0 END
        WHEN g.winner_against_spread = 'push' THEN 10
        ELSE 0
    END,
    updated_at = NOW()
FROM games g
WHERE picks.game_id = g.id
  AND picks.result IS NULL
  AND g.status = 'completed'
  AND g.home_score IS NOT NULL
  AND g.away_score IS NOT NULL;

-- Show results
SELECT 
    'After update:' as status,
    COUNT(*) as total_picks,
    COUNT(CASE WHEN result IS NULL THEN 1 END) as null_results,
    COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
    COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
    COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes
FROM picks p
JOIN games g ON p.game_id = g.id
WHERE g.status = 'completed';