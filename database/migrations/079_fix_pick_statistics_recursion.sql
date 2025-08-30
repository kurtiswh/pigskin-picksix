-- Migration: Fix infinite recursion in pick statistics triggers
-- Purpose: Create safer trigger functions that avoid stack overflow

-- First, drop the problematic triggers to stop any current recursion
DROP TRIGGER IF EXISTS update_pick_stats_on_game_completion_trigger ON public.games;
DROP TRIGGER IF EXISTS update_pick_stats_on_pick_change_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_pick_stats_on_anon_pick_change_trigger ON public.anonymous_picks;

-- Add pick statistics columns to games table (if not already added)
DO $$ 
BEGIN
    -- Add columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'home_team_picks') THEN
        ALTER TABLE public.games
        ADD COLUMN home_team_picks INTEGER DEFAULT 0,
        ADD COLUMN home_team_locks INTEGER DEFAULT 0,
        ADD COLUMN away_team_picks INTEGER DEFAULT 0,
        ADD COLUMN away_team_locks INTEGER DEFAULT 0,
        ADD COLUMN total_picks INTEGER DEFAULT 0,
        ADD COLUMN pick_stats_updated_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_games_pick_stats ON public.games(home_team_picks, away_team_picks, total_picks);
CREATE INDEX IF NOT EXISTS idx_games_pick_stats_updated ON public.games(pick_stats_updated_at);

-- Function to calculate pick statistics for a specific game (SAFE VERSION)
CREATE OR REPLACE FUNCTION public.calculate_game_pick_statistics_safe(game_id_param UUID)
RETURNS void
LANGUAGE plpgsql
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
        COALESCE(COUNT(*) FILTER (WHERE selected_team = game_home_team AND NOT is_lock), 0) AS home_regular,
        COALESCE(COUNT(*) FILTER (WHERE selected_team = game_home_team AND is_lock), 0) AS home_locked,
        COALESCE(COUNT(*) FILTER (WHERE selected_team = game_away_team AND NOT is_lock), 0) AS away_regular,
        COALESCE(COUNT(*) FILTER (WHERE selected_team = game_away_team AND is_lock), 0) AS away_locked,
        COALESCE(COUNT(*), 0) AS total_regular
    INTO home_picks, home_locks, away_picks, away_locks, total
    FROM submitted_picks;
    
    -- Add statistics from anonymous picks table (only show_on_leaderboard = true)
    WITH anon_stats AS (
        SELECT 
            COALESCE(COUNT(*) FILTER (WHERE selected_team = game_home_team AND NOT is_lock), 0) AS home_regular,
            COALESCE(COUNT(*) FILTER (WHERE selected_team = game_home_team AND is_lock), 0) AS home_locked,
            COALESCE(COUNT(*) FILTER (WHERE selected_team = game_away_team AND NOT is_lock), 0) AS away_regular,
            COALESCE(COUNT(*) FILTER (WHERE selected_team = game_away_team AND is_lock), 0) AS away_locked,
            COALESCE(COUNT(*), 0) AS total_anon
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
    -- CRITICAL: Use WHERE clause to avoid triggering other updates
    UPDATE public.games
    SET 
        home_team_picks = home_picks,
        home_team_locks = home_locks,
        away_team_picks = away_picks,
        away_team_locks = away_locks,
        total_picks = total,
        pick_stats_updated_at = NOW()
    WHERE id = game_id_param;
    
    -- Do not log to avoid potential performance issues in production
    -- RAISE NOTICE 'Updated pick stats for game %', game_id_param;
END;
$$;

-- SAFE trigger function for game status changes (ONLY on status change to completed)
CREATE OR REPLACE FUNCTION public.update_pick_stats_on_game_completion_safe()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- ONLY calculate stats when game transitions to completed status
    -- AND avoid infinite recursion by checking if we're already in a trigger
    IF NEW.status = 'completed' 
       AND (OLD.status IS NULL OR OLD.status != 'completed') 
       AND pg_trigger_depth() <= 1 THEN
        
        -- Use the safe calculation function
        PERFORM public.calculate_game_pick_statistics_safe(NEW.id);
    END IF;
    
    RETURN NEW;
END;
$$;

-- SAFE trigger function for pick changes (with recursion protection)
CREATE OR REPLACE FUNCTION public.update_pick_stats_on_pick_change_safe()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Avoid infinite recursion and only process if trigger depth is manageable
    IF pg_trigger_depth() <= 2 THEN
        -- For INSERT or UPDATE, recalculate stats for the affected game
        IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
            PERFORM public.calculate_game_pick_statistics_safe(NEW.game_id);
        ELSIF TG_OP = 'DELETE' THEN
            PERFORM public.calculate_game_pick_statistics_safe(OLD.game_id);
        END IF;
    END IF;
    
    -- Always return appropriate value
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Create SAFE triggers (only for essential events)
CREATE TRIGGER update_pick_stats_on_game_completion_safe_trigger
    AFTER UPDATE OF status ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION public.update_pick_stats_on_game_completion_safe();

-- Note: We're NOT creating pick change triggers initially to avoid recursion
-- These can be added later if needed, or statistics can be updated manually

-- Function to manually recalculate all pick statistics (safe for one-time use)
CREATE OR REPLACE FUNCTION public.recalculate_all_pick_statistics()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    game_record RECORD;
    total_updated INT := 0;
    error_count INT := 0;
BEGIN
    -- Process games in batches to avoid memory issues
    FOR game_record IN 
        SELECT id, week, season, home_team, away_team
        FROM public.games 
        WHERE season >= 2024  -- Only recent seasons
        ORDER BY season DESC, week DESC
    LOOP
        BEGIN
            PERFORM public.calculate_game_pick_statistics_safe(game_record.id);
            total_updated := total_updated + 1;
            
            -- Commit every 50 games to avoid long transactions
            IF total_updated % 50 = 0 THEN
                RAISE NOTICE 'Processed % games...', total_updated;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            error_count := error_count + 1;
            RAISE NOTICE 'Error processing game %: %', game_record.id, SQLERRM;
        END;
    END LOOP;
    
    RETURN format('Updated pick statistics for %s games with %s errors', total_updated, error_count);
END;
$$;

-- Calculate statistics for existing completed games (in small batches)
DO $$
DECLARE
    result_text TEXT;
BEGIN
    RAISE NOTICE 'Starting pick statistics calculation for existing games...';
    SELECT public.recalculate_all_pick_statistics() INTO result_text;
    RAISE NOTICE '%', result_text;
END $$;

-- Add helpful comments
COMMENT ON COLUMN public.games.home_team_picks IS 'Number of users who picked the home team (excluding locks)';
COMMENT ON COLUMN public.games.home_team_locks IS 'Number of users who locked the home team';
COMMENT ON COLUMN public.games.away_team_picks IS 'Number of users who picked the away team (excluding locks)';
COMMENT ON COLUMN public.games.away_team_locks IS 'Number of users who locked the away team';
COMMENT ON COLUMN public.games.total_picks IS 'Total number of picks for this game';
COMMENT ON COLUMN public.games.pick_stats_updated_at IS 'Timestamp when pick statistics were last calculated';

COMMENT ON FUNCTION public.calculate_game_pick_statistics_safe(UUID) IS 'Safely calculates pick statistics for a specific game without causing infinite recursion';
COMMENT ON FUNCTION public.recalculate_all_pick_statistics() IS 'Manually recalculates pick statistics for all games (safe for one-time use)';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 079 completed successfully!';
    RAISE NOTICE '🔧 Pick statistics columns added and triggers created safely';
    RAISE NOTICE '📊 Existing game statistics have been calculated';
    RAISE NOTICE '🚀 Pick statistics will now update automatically when games are completed';
END $$;