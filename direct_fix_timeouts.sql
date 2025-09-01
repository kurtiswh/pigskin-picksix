-- Direct SQL to fix the timeout issues
-- This bypasses functions and directly updates the picks

-- Step 1: First, let's identify the problem games
DO $$
DECLARE
    vt_sc_game RECORD;
    nd_miami_game RECORD;
BEGIN
    RAISE NOTICE '🔍 Finding problem games...';
    
    -- Get Virginia Tech @ South Carolina game details
    SELECT * INTO vt_sc_game
    FROM games 
    WHERE season = 2025 
    AND week = 1
    AND home_team = 'South Carolina' 
    AND away_team = 'Virginia Tech'
    AND status = 'completed'
    LIMIT 1;
    
    -- Get Notre Dame @ Miami game details
    SELECT * INTO nd_miami_game
    FROM games 
    WHERE season = 2025 
    AND week = 1
    AND home_team = 'Miami' 
    AND away_team = 'Notre Dame'
    AND status = 'completed'
    LIMIT 1;
    
    IF vt_sc_game.id IS NOT NULL THEN
        RAISE NOTICE '';
        RAISE NOTICE '📊 Virginia Tech @ South Carolina:';
        RAISE NOTICE '  ID: %', vt_sc_game.id;
        RAISE NOTICE '  Score: % - %', vt_sc_game.away_score, vt_sc_game.home_score;
        RAISE NOTICE '  Spread: %', vt_sc_game.spread;
        RAISE NOTICE '  Status: %', vt_sc_game.status;
    END IF;
    
    IF nd_miami_game.id IS NOT NULL THEN
        RAISE NOTICE '';
        RAISE NOTICE '📊 Notre Dame @ Miami:';
        RAISE NOTICE '  ID: %', nd_miami_game.id;
        RAISE NOTICE '  Score: % - %', nd_miami_game.away_score, nd_miami_game.home_score;
        RAISE NOTICE '  Spread: %', nd_miami_game.spread;
        RAISE NOTICE '  Status: %', nd_miami_game.status;
    END IF;
END;
$$;

-- Step 2: Calculate and update game statistics first
UPDATE games g
SET 
    winner_against_spread = CASE 
        WHEN ABS((home_score - away_score) + spread) < 0.5 THEN 'push'
        WHEN (home_score - away_score) + spread > 0 THEN home_team
        ELSE away_team
    END,
    margin_bonus = CASE 
        WHEN ABS((home_score - away_score) + spread) < 0.5 THEN 0
        WHEN ABS((home_score - away_score) + spread) >= 29 THEN 5
        WHEN ABS((home_score - away_score) + spread) >= 20 THEN 3
        WHEN ABS((home_score - away_score) + spread) >= 11 THEN 1
        ELSE 0
    END,
    base_points = 20,
    updated_at = CURRENT_TIMESTAMP
WHERE season = 2025 
AND week = 1
AND status = 'completed'
AND home_score IS NOT NULL
AND away_score IS NOT NULL
AND winner_against_spread IS NULL
AND (
    (home_team = 'South Carolina' AND away_team = 'Virginia Tech') OR
    (home_team = 'Miami' AND away_team = 'Notre Dame')
);

-- Step 3: Update picks for Virginia Tech @ South Carolina
WITH vt_sc_game AS (
    SELECT 
        id,
        winner_against_spread,
        margin_bonus
    FROM games 
    WHERE season = 2025 
    AND week = 1
    AND home_team = 'South Carolina' 
    AND away_team = 'Virginia Tech'
    AND status = 'completed'
    LIMIT 1
)
UPDATE picks p
SET 
    result = CASE 
        WHEN p.selected_team = g.winner_against_spread THEN 'win'::pick_result
        WHEN g.winner_against_spread = 'push' THEN 'push'::pick_result
        ELSE 'loss'::pick_result
    END,
    points_earned = CASE 
        WHEN p.selected_team = g.winner_against_spread THEN 
            20 + COALESCE(g.margin_bonus, 0) + 
            CASE WHEN p.is_lock THEN COALESCE(g.margin_bonus, 0) ELSE 0 END
        WHEN g.winner_against_spread = 'push' THEN 10
        ELSE 0
    END,
    updated_at = CURRENT_TIMESTAMP
FROM vt_sc_game g
WHERE p.game_id = g.id
AND p.result IS NULL;

-- Step 4: Update anonymous picks for Virginia Tech @ South Carolina  
WITH vt_sc_game AS (
    SELECT 
        id,
        winner_against_spread,
        margin_bonus
    FROM games 
    WHERE season = 2025 
    AND week = 1
    AND home_team = 'South Carolina' 
    AND away_team = 'Virginia Tech'
    AND status = 'completed'
    LIMIT 1
)
UPDATE anonymous_picks ap
SET 
    result = CASE 
        WHEN ap.selected_team = g.winner_against_spread THEN 'win'::pick_result
        WHEN g.winner_against_spread = 'push' THEN 'push'::pick_result
        ELSE 'loss'::pick_result
    END,
    points_earned = CASE 
        WHEN ap.selected_team = g.winner_against_spread THEN 
            20 + COALESCE(g.margin_bonus, 0) + 
            CASE WHEN ap.is_lock THEN COALESCE(g.margin_bonus, 0) ELSE 0 END
        WHEN g.winner_against_spread = 'push' THEN 10
        ELSE 0
    END
FROM vt_sc_game g
WHERE ap.game_id = g.id
AND ap.result IS NULL;

-- Step 5: Update picks for Notre Dame @ Miami
WITH nd_miami_game AS (
    SELECT 
        id,
        winner_against_spread,
        margin_bonus
    FROM games 
    WHERE season = 2025 
    AND week = 1
    AND home_team = 'Miami' 
    AND away_team = 'Notre Dame'
    AND status = 'completed'
    LIMIT 1
)
UPDATE picks p
SET 
    result = CASE 
        WHEN p.selected_team = g.winner_against_spread THEN 'win'::pick_result
        WHEN g.winner_against_spread = 'push' THEN 'push'::pick_result
        ELSE 'loss'::pick_result
    END,
    points_earned = CASE 
        WHEN p.selected_team = g.winner_against_spread THEN 
            20 + COALESCE(g.margin_bonus, 0) + 
            CASE WHEN p.is_lock THEN COALESCE(g.margin_bonus, 0) ELSE 0 END
        WHEN g.winner_against_spread = 'push' THEN 10
        ELSE 0
    END,
    updated_at = CURRENT_TIMESTAMP
FROM nd_miami_game g
WHERE p.game_id = g.id
AND p.result IS NULL;

-- Step 6: Update anonymous picks for Notre Dame @ Miami
WITH nd_miami_game AS (
    SELECT 
        id,
        winner_against_spread,
        margin_bonus
    FROM games 
    WHERE season = 2025 
    AND week = 1
    AND home_team = 'Miami' 
    AND away_team = 'Notre Dame'
    AND status = 'completed'
    LIMIT 1
)
UPDATE anonymous_picks ap
SET 
    result = CASE 
        WHEN ap.selected_team = g.winner_against_spread THEN 'win'::pick_result
        WHEN g.winner_against_spread = 'push' THEN 'push'::pick_result
        ELSE 'loss'::pick_result
    END,
    points_earned = CASE 
        WHEN ap.selected_team = g.winner_against_spread THEN 
            20 + COALESCE(g.margin_bonus, 0) + 
            CASE WHEN ap.is_lock THEN COALESCE(g.margin_bonus, 0) ELSE 0 END
        WHEN g.winner_against_spread = 'push' THEN 10
        ELSE 0
    END
FROM nd_miami_game g
WHERE ap.game_id = g.id
AND ap.result IS NULL;

-- Step 7: Show results
DO $$
DECLARE
    vt_sc_picks_count INTEGER;
    vt_sc_anon_count INTEGER;
    nd_miami_picks_count INTEGER;
    nd_miami_anon_count INTEGER;
    vt_sc_game_id UUID;
    nd_miami_game_id UUID;
BEGIN
    -- Get game IDs
    SELECT id INTO vt_sc_game_id FROM games 
    WHERE season = 2025 AND week = 1 
    AND home_team = 'South Carolina' AND away_team = 'Virginia Tech' LIMIT 1;
    
    SELECT id INTO nd_miami_game_id FROM games 
    WHERE season = 2025 AND week = 1
    AND home_team = 'Miami' AND away_team = 'Notre Dame' LIMIT 1;
    
    -- Count updated picks
    SELECT COUNT(*) INTO vt_sc_picks_count
    FROM picks WHERE game_id = vt_sc_game_id AND result IS NOT NULL;
    
    SELECT COUNT(*) INTO vt_sc_anon_count
    FROM anonymous_picks WHERE game_id = vt_sc_game_id AND result IS NOT NULL;
    
    SELECT COUNT(*) INTO nd_miami_picks_count
    FROM picks WHERE game_id = nd_miami_game_id AND result IS NOT NULL;
    
    SELECT COUNT(*) INTO nd_miami_anon_count
    FROM anonymous_picks WHERE game_id = nd_miami_game_id AND result IS NOT NULL;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ RESULTS:';
    RAISE NOTICE '📊 Virginia Tech @ South Carolina:';
    RAISE NOTICE '  Regular picks processed: %', vt_sc_picks_count;
    RAISE NOTICE '  Anonymous picks processed: %', vt_sc_anon_count;
    RAISE NOTICE '';
    RAISE NOTICE '📊 Notre Dame @ Miami:';
    RAISE NOTICE '  Regular picks processed: %', nd_miami_picks_count;
    RAISE NOTICE '  Anonymous picks processed: %', nd_miami_anon_count;
    RAISE NOTICE '';
    RAISE NOTICE '🏁 Direct update complete!';
END;
$$;