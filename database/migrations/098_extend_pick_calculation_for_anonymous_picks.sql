-- Migration 098: Extend pick calculation triggers to include anonymous picks
-- Purpose: Make anonymous picks get win/loss results when games complete, just like regular picks

-- Step 1: Create function to calculate anonymous pick results (similar to regular picks)
CREATE OR REPLACE FUNCTION public.calculate_anonymous_pick_results(game_id UUID)
RETURNS INTEGER
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
    game_record RECORD;
    picks_updated INTEGER := 0;
BEGIN
    -- Get the completed game data
    SELECT winner_against_spread, base_points, margin_bonus, status
    INTO game_record
    FROM public.games 
    WHERE id = game_id AND status = 'completed';
    
    -- If game not found or not completed, return 0
    IF NOT FOUND OR game_record.winner_against_spread IS NULL THEN
        RAISE NOTICE 'Cannot calculate anonymous picks for game % - not completed or missing winner data', game_id;
        RETURN 0;
    END IF;
    
    -- Update anonymous picks with results (same logic as regular picks)
    UPDATE public.anonymous_picks
    SET 
        result = CASE 
            WHEN selected_team = game_record.winner_against_spread THEN 'win'::pick_result
            WHEN game_record.winner_against_spread = 'push' THEN 'push'::pick_result
            ELSE 'loss'::pick_result
        END,
        points_earned = CASE 
            WHEN selected_team = game_record.winner_against_spread THEN 
                game_record.base_points + game_record.margin_bonus + 
                CASE WHEN is_lock THEN game_record.margin_bonus ELSE 0 END
            WHEN game_record.winner_against_spread = 'push' THEN 10
            ELSE 0
        END,
        updated_at = NOW()
    WHERE public.anonymous_picks.game_id = calculate_anonymous_pick_results.game_id
      AND result IS NULL; -- Only update picks that haven't been calculated yet
    
    GET DIAGNOSTICS picks_updated = ROW_COUNT;
    
    RAISE NOTICE 'Updated % anonymous picks for completed game %', picks_updated, game_id;
    
    RETURN picks_updated;
END;
$$;

-- Step 2: Add comment for the new function
COMMENT ON FUNCTION public.calculate_anonymous_pick_results(UUID) IS 
'Calculates win/loss results and points for anonymous picks when a game completes. Uses same logic as regular picks.';

-- Step 3: Update the existing completion trigger to also process anonymous picks
CREATE OR REPLACE FUNCTION process_picks_on_completion()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    regular_picks_updated INTEGER;
    anonymous_picks_updated INTEGER;
BEGIN
    -- Only process picks when game status changes to completed
    IF OLD.status IS DISTINCT FROM 'completed' AND NEW.status = 'completed' THEN
        
        -- Process regular picks (existing functionality)
        PERFORM calculate_pick_results(NEW.id);
        
        -- Process anonymous picks (new functionality)
        SELECT calculate_anonymous_pick_results(NEW.id) INTO anonymous_picks_updated;
        
        RAISE NOTICE 'Game completed: % @ % - processed regular + % anonymous picks', 
            NEW.away_team, NEW.home_team, anonymous_picks_updated;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Step 4: Create a trigger specifically for anonymous picks table (like the regular picks table)
-- This handles cases where anonymous picks are inserted/updated after a game is already completed
CREATE OR REPLACE FUNCTION public.update_anonymous_picks_from_completed_games()
RETURNS TRIGGER AS $$
DECLARE
    game_record RECORD;
BEGIN
    -- Only process if this is for a completed game
    SELECT winner_against_spread, base_points, margin_bonus, status
    INTO game_record
    FROM public.games 
    WHERE id = COALESCE(NEW.game_id, OLD.game_id)
      AND status = 'completed';
    
    -- If no completed game found, don't change anything
    IF NOT FOUND OR game_record.winner_against_spread IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- If this is NEW (INSERT/UPDATE), update the pick result based on games table
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Direct comparison: if selected_team matches winner_against_spread = win
        IF NEW.selected_team = game_record.winner_against_spread THEN
            NEW.result = 'win';
            NEW.points_earned = game_record.base_points + game_record.margin_bonus + 
                               CASE WHEN NEW.is_lock THEN game_record.margin_bonus ELSE 0 END;
        ELSIF game_record.winner_against_spread = 'push' THEN
            NEW.result = 'push';
            NEW.points_earned = 10;
        ELSE
            NEW.result = 'loss';
            NEW.points_earned = 0;
        END IF;
        
        RAISE NOTICE 'Updated anonymous pick result: % -> % (% points)', 
            NEW.selected_team, NEW.result, NEW.points_earned;
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger on anonymous_picks table (matching the one on picks table)
DROP TRIGGER IF EXISTS update_anonymous_picks_from_games_trigger ON public.anonymous_picks;
CREATE TRIGGER update_anonymous_picks_from_games_trigger
    BEFORE INSERT OR UPDATE ON public.anonymous_picks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_anonymous_picks_from_completed_games();

-- Step 6: Add trigger comment for documentation
COMMENT ON TRIGGER update_anonymous_picks_from_games_trigger ON public.anonymous_picks IS 
'Automatically calculates win/loss result and points when anonymous picks are inserted/updated for completed games';

-- Step 7: Test the new system by updating existing anonymous picks for any completed games
-- This will populate results for any anonymous picks that already exist for completed games
DO $$
DECLARE
    completed_game_count INTEGER;
    total_picks_updated INTEGER := 0;
    current_game_id UUID;
    picks_for_game INTEGER;
BEGIN
    -- Count completed games
    SELECT COUNT(*) INTO completed_game_count 
    FROM public.games 
    WHERE status = 'completed' AND winner_against_spread IS NOT NULL;
    
    IF completed_game_count > 0 THEN
        RAISE NOTICE 'Found % completed games - updating anonymous pick results...', completed_game_count;
        
        -- Process each completed game
        FOR current_game_id IN 
            SELECT id FROM public.games 
            WHERE status = 'completed' AND winner_against_spread IS NOT NULL
        LOOP
            SELECT calculate_anonymous_pick_results(current_game_id) INTO picks_for_game;
            total_picks_updated := total_picks_updated + picks_for_game;
        END LOOP;
        
        RAISE NOTICE '✅ Updated % anonymous picks across % completed games', 
            total_picks_updated, completed_game_count;
    ELSE
        RAISE NOTICE 'No completed games found - anonymous picks will be updated when games complete';
    END IF;
END;
$$;

-- Step 8: Summary of changes
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 MIGRATION 098 COMPLETE: Anonymous Picks Integration';
    RAISE NOTICE '======================================================';
    RAISE NOTICE '';
    RAISE NOTICE '✅ CREATED:';
    RAISE NOTICE '  - calculate_anonymous_pick_results() function';
    RAISE NOTICE '  - update_anonymous_picks_from_completed_games() trigger function';
    RAISE NOTICE '  - update_anonymous_picks_from_games_trigger on anonymous_picks table';
    RAISE NOTICE '';
    RAISE NOTICE '✅ UPDATED:';
    RAISE NOTICE '  - process_picks_on_completion() now handles both pick types';
    RAISE NOTICE '  - Existing anonymous picks updated for completed games';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 RESULT:';
    RAISE NOTICE '  - Anonymous picks get win/loss results when games complete';
    RAISE NOTICE '  - Points calculated using same logic as regular picks';
    RAISE NOTICE '  - Works with existing precedence system (is_active_pick_set)';
    RAISE NOTICE '  - Ready for user profile and leaderboard integration';
    RAISE NOTICE '';
END;
$$;