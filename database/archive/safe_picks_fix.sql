-- Safe approach to fix remaining picks without system trigger conflicts

-- Step 1: Apply Migration 117 first (safe trigger management)
-- Then run the steps below:

-- Step 2: Check what picks need fixing
SELECT 
    'Before fix:' as status,
    COUNT(*) as total_picks,
    COUNT(CASE WHEN result IS NULL THEN 1 END) as null_results,
    COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
    COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
    COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes
FROM picks p
JOIN games g ON p.game_id = g.id
WHERE g.status = 'completed';

-- Step 3: Show the specific picks that need fixing
SELECT 
    p.id,
    u.display_name,
    p.selected_team,
    p.is_lock,
    g.away_team || ' @ ' || g.home_team as game,
    g.away_score || '-' || g.home_score as final_score,
    g.winner_against_spread,
    g.margin_bonus,
    -- Calculate what the result should be
    CASE 
        WHEN p.selected_team = g.winner_against_spread THEN 'win'
        WHEN g.winner_against_spread = 'push' THEN 'push'
        ELSE 'loss'
    END as should_be_result,
    -- Calculate what the points should be
    CASE 
        WHEN p.selected_team = g.winner_against_spread THEN 
            20 + COALESCE(g.margin_bonus, 0) + 
            CASE WHEN p.is_lock THEN COALESCE(g.margin_bonus, 0) ELSE 0 END
        WHEN g.winner_against_spread = 'push' THEN 10
        ELSE 0
    END as should_be_points
FROM picks p
JOIN games g ON p.game_id = g.id
JOIN users u ON p.user_id = u.id
WHERE p.result IS NULL
  AND g.status = 'completed'
  AND g.home_score IS NOT NULL
  AND g.away_score IS NOT NULL
ORDER BY g.away_team, g.home_team, u.display_name;

-- Step 4: Update the picks (run this after reviewing the above)
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

-- Step 5: Verify the fix
SELECT 
    'After fix:' as status,
    COUNT(*) as total_picks,
    COUNT(CASE WHEN result IS NULL THEN 1 END) as null_results,
    COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
    COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
    COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
    SUM(points_earned) as total_points
FROM picks p
JOIN games g ON p.game_id = g.id
WHERE g.status = 'completed';

-- Step 6: Re-enable triggers safely (run this last)
SELECT public.reenable_user_triggers('picks');