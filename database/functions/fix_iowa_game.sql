-- Create a function to fix the Iowa game efficiently
CREATE OR REPLACE FUNCTION fix_iowa_game()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_game_id UUID := '45f22991-9bbe-4c94-b328-f91ea493ac84';
  v_picks_cleared INTEGER := 0;
  v_anon_picks_cleared INTEGER := 0;
  v_batch_size INTEGER := 10;
  v_total_batches INTEGER := 0;
BEGIN
  -- Reset game first (quick operation)
  UPDATE games
  SET 
    status = 'scheduled',
    home_score = NULL,
    away_score = NULL,
    winner_against_spread = NULL,
    margin_bonus = NULL,
    base_points = NULL,
    game_period = NULL,
    game_clock = NULL,
    api_period = NULL,
    api_clock = NULL,
    api_home_points = NULL,
    api_away_points = NULL,
    api_completed = false,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = v_game_id;
  
  -- Clear picks in small batches using a loop
  LOOP
    -- Update a small batch of picks
    WITH batch AS (
      SELECT id
      FROM picks
      WHERE game_id = v_game_id
        AND result IS NOT NULL
      LIMIT v_batch_size
      FOR UPDATE SKIP LOCKED  -- Skip locked rows to avoid conflicts
    )
    UPDATE picks p
    SET 
      result = NULL,
      points_earned = NULL,
      updated_at = CURRENT_TIMESTAMP
    FROM batch b
    WHERE p.id = b.id;
    
    -- Check how many rows were affected
    GET DIAGNOSTICS v_picks_cleared = ROW_COUNT;
    v_total_batches := v_total_batches + 1;
    
    -- Exit when no more rows to update
    EXIT WHEN v_picks_cleared = 0;
    
    -- Brief pause to avoid overwhelming the system
    PERFORM pg_sleep(0.01);  -- 10ms pause
  END LOOP;
  
  -- Get final count of cleared picks
  SELECT COUNT(*) INTO v_picks_cleared
  FROM picks
  WHERE game_id = v_game_id AND result IS NULL;
  
  -- Clear anonymous picks (usually fewer)
  UPDATE anonymous_picks
  SET 
    result = NULL,
    points_earned = NULL
  WHERE game_id = v_game_id
    AND result IS NOT NULL;
  
  GET DIAGNOSTICS v_anon_picks_cleared = ROW_COUNT;
  
  -- Return summary
  RETURN json_build_object(
    'success', true,
    'game_id', v_game_id,
    'picks_cleared', v_picks_cleared,
    'anonymous_picks_cleared', v_anon_picks_cleared,
    'total_batches', v_total_batches,
    'message', 'Iowa game successfully reset'
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'message', 'Failed to reset Iowa game'
    );
END;
$$;

-- Alternative: Simple direct approach with no loops
CREATE OR REPLACE FUNCTION fix_iowa_game_simple()
RETURNS json
LANGUAGE plpgsql
AS $$
DECLARE
  v_game_id UUID := '45f22991-9bbe-4c94-b328-f91ea493ac84';
  v_picks_cleared INTEGER;
  v_anon_picks_cleared INTEGER;
BEGIN
  -- Use a simpler approach - clear by team
  
  -- Clear Iowa picks
  UPDATE picks
  SET result = NULL, points_earned = NULL, updated_at = CURRENT_TIMESTAMP
  WHERE game_id = v_game_id AND selected_team = 'Iowa';
  
  GET DIAGNOSTICS v_picks_cleared = ROW_COUNT;
  
  -- Clear Iowa State picks
  UPDATE picks
  SET result = NULL, points_earned = NULL, updated_at = CURRENT_TIMESTAMP
  WHERE game_id = v_game_id AND selected_team = 'Iowa State';
  
  GET DIAGNOSTICS v_picks_cleared = v_picks_cleared + ROW_COUNT;
  
  -- Clear anonymous picks
  UPDATE anonymous_picks
  SET result = NULL, points_earned = NULL
  WHERE game_id = v_game_id;
  
  GET DIAGNOSTICS v_anon_picks_cleared = ROW_COUNT;
  
  -- Reset game
  UPDATE games
  SET 
    status = 'scheduled',
    home_score = NULL,
    away_score = NULL,
    winner_against_spread = NULL,
    margin_bonus = NULL,
    base_points = NULL,
    updated_at = CURRENT_TIMESTAMP
  WHERE id = v_game_id;
  
  RETURN json_build_object(
    'success', true,
    'picks_cleared', v_picks_cleared,
    'anonymous_picks_cleared', v_anon_picks_cleared
  );
END;
$$;