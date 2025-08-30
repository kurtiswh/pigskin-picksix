-- Migration: Add pick statistics columns to games table
-- Purpose: Track how many users picked and locked each team for every game

-- Add pick statistics columns to games table
ALTER TABLE public.games
ADD COLUMN IF NOT EXISTS home_team_picks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS home_team_locks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_team_picks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS away_team_locks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_picks INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pick_stats_updated_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_games_pick_stats ON public.games(home_team_picks, away_team_picks, total_picks);
CREATE INDEX IF NOT EXISTS idx_games_pick_stats_updated ON public.games(pick_stats_updated_at);

-- Function to calculate pick statistics for a specific game
CREATE OR REPLACE FUNCTION public.calculate_game_pick_statistics(game_id_param UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    home_picks INT := 0;
    home_locks INT := 0;
    away_picks INT := 0;
    away_locks INT := 0;
    total INT := 0;
    game_home_team TEXT;
    game_away_team TEXT;
BEGIN
    -- Get team names for this game
    SELECT home_team, away_team INTO game_home_team, game_away_team
    FROM public.games
    WHERE id = game_id_param;
    
    IF game_home_team IS NULL OR game_away_team IS NULL THEN
        RAISE NOTICE 'Game % not found', game_id_param;
        RETURN;
    END IF;
    
    -- Calculate statistics from regular picks table (only submitted picks)
    -- Note: We check for submitted picks by checking if user has at least one pick for that week/season
    WITH submitted_picks AS (
        SELECT p.selected_team, p.is_lock
        FROM public.picks p
        WHERE p.game_id = game_id_param
        AND EXISTS (
            -- User has submitted picks for this week
            SELECT 1 FROM public.picks p2 
            WHERE p2.user_id = p.user_id 
            AND p2.week = p.week 
            AND p2.season = p.season
            LIMIT 1
        )
    )
    SELECT 
        COUNT(*) FILTER (WHERE selected_team = game_home_team AND NOT is_lock) AS home_regular,
        COUNT(*) FILTER (WHERE selected_team = game_home_team AND is_lock) AS home_locked,
        COUNT(*) FILTER (WHERE selected_team = game_away_team AND NOT is_lock) AS away_regular,
        COUNT(*) FILTER (WHERE selected_team = game_away_team AND is_lock) AS away_locked,
        COUNT(*) AS total_regular
    INTO home_picks, home_locks, away_picks, away_locks, total
    FROM submitted_picks;
    
    -- Add statistics from anonymous picks table (only show_on_leaderboard = true)
    WITH anon_stats AS (
        SELECT 
            COUNT(*) FILTER (WHERE selected_team = game_home_team AND NOT is_lock) AS home_regular,
            COUNT(*) FILTER (WHERE selected_team = game_home_team AND is_lock) AS home_locked,
            COUNT(*) FILTER (WHERE selected_team = game_away_team AND NOT is_lock) AS away_regular,
            COUNT(*) FILTER (WHERE selected_team = game_away_team AND is_lock) AS away_locked,
            COUNT(*) AS total_anon
        FROM public.anonymous_picks ap
        WHERE ap.game_id = game_id_param
        AND ap.show_on_leaderboard = true
        AND ap.submitted_at IS NOT NULL
    )
    SELECT 
        home_picks + COALESCE(home_regular, 0),
        home_locks + COALESCE(home_locked, 0),
        away_picks + COALESCE(away_regular, 0),
        away_locks + COALESCE(away_locked, 0),
        total + COALESCE(total_anon, 0)
    INTO home_picks, home_locks, away_picks, away_locks, total
    FROM anon_stats;
    
    -- Update the game record with calculated statistics
    UPDATE public.games
    SET 
        home_team_picks = home_picks,
        home_team_locks = home_locks,
        away_team_picks = away_picks,
        away_team_locks = away_locks,
        total_picks = total,
        pick_stats_updated_at = NOW()
    WHERE id = game_id_param;
    
    RAISE NOTICE 'Updated pick stats for game %: Home(%, L%), Away(%, L%), Total %', 
        game_id_param, home_picks, home_locks, away_picks, away_locks, total;
END;
$$;

-- Function to calculate pick statistics for all games in a week
CREATE OR REPLACE FUNCTION public.calculate_week_pick_statistics(week_param INT, season_param INT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    game_record RECORD;
    games_updated INT := 0;
BEGIN
    FOR game_record IN 
        SELECT id 
        FROM public.games 
        WHERE week = week_param 
        AND season = season_param
    LOOP
        PERFORM public.calculate_game_pick_statistics(game_record.id);
        games_updated := games_updated + 1;
    END LOOP;
    
    RAISE NOTICE 'Updated pick statistics for % games in Week % of %', games_updated, week_param, season_param;
END;
$$;

-- Trigger function to update pick statistics when game status changes to completed
CREATE OR REPLACE FUNCTION public.update_pick_stats_on_game_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only calculate stats when game transitions to completed status
    IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
        -- Calculate pick statistics for this game
        PERFORM public.calculate_game_pick_statistics(NEW.id);
        
        RAISE NOTICE 'Calculated pick statistics for completed game %', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for game completion
DROP TRIGGER IF EXISTS update_pick_stats_on_game_completion_trigger ON public.games;
CREATE TRIGGER update_pick_stats_on_game_completion_trigger
    AFTER UPDATE OF status ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION public.update_pick_stats_on_game_completion();

-- Also update stats when picks are inserted or updated (for real-time tracking)
CREATE OR REPLACE FUNCTION public.update_pick_stats_on_pick_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- For INSERT or UPDATE, recalculate stats for the affected game
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        PERFORM public.calculate_game_pick_statistics(NEW.game_id);
    ELSIF TG_OP = 'DELETE' THEN
        PERFORM public.calculate_game_pick_statistics(OLD.game_id);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for pick changes (regular picks)
DROP TRIGGER IF EXISTS update_pick_stats_on_pick_change_trigger ON public.picks;
CREATE TRIGGER update_pick_stats_on_pick_change_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.picks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_pick_stats_on_pick_change();

-- Create trigger for anonymous pick changes
DROP TRIGGER IF EXISTS update_pick_stats_on_anon_pick_change_trigger ON public.anonymous_picks;
CREATE TRIGGER update_pick_stats_on_anon_pick_change_trigger
    AFTER INSERT OR UPDATE OF selected_team, is_lock, show_on_leaderboard OR DELETE ON public.anonymous_picks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_pick_stats_on_pick_change();

-- Calculate initial statistics for all existing completed games
DO $$
DECLARE
    game_record RECORD;
    total_updated INT := 0;
BEGIN
    FOR game_record IN 
        SELECT id, week, season 
        FROM public.games 
        WHERE status = 'completed'
        ORDER BY season DESC, week DESC
    LOOP
        PERFORM public.calculate_game_pick_statistics(game_record.id);
        total_updated := total_updated + 1;
    END LOOP;
    
    RAISE NOTICE 'Calculated initial pick statistics for % completed games', total_updated;
END $$;

-- Calculate statistics for all games (including scheduled and in-progress) for current display
DO $$
DECLARE
    game_record RECORD;
    total_updated INT := 0;
BEGIN
    FOR game_record IN 
        SELECT id, week, season 
        FROM public.games 
        WHERE season >= 2024  -- Only recent seasons to avoid excessive processing
        ORDER BY season DESC, week DESC
    LOOP
        PERFORM public.calculate_game_pick_statistics(game_record.id);
        total_updated := total_updated + 1;
    END LOOP;
    
    RAISE NOTICE 'Calculated pick statistics for % total games', total_updated;
END $$;

-- Add comment to explain the columns
COMMENT ON COLUMN public.games.home_team_picks IS 'Number of users who picked the home team (excluding locks)';
COMMENT ON COLUMN public.games.home_team_locks IS 'Number of users who locked the home team';
COMMENT ON COLUMN public.games.away_team_picks IS 'Number of users who picked the away team (excluding locks)';
COMMENT ON COLUMN public.games.away_team_locks IS 'Number of users who locked the away team';
COMMENT ON COLUMN public.games.total_picks IS 'Total number of picks for this game';
COMMENT ON COLUMN public.games.pick_stats_updated_at IS 'Timestamp when pick statistics were last calculated';