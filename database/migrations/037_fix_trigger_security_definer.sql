-- Fix trigger functions to run with elevated privileges (SECURITY DEFINER)
-- This allows them to bypass RLS policies when updating leaderboard tables

-- Drop existing trigger functions and recreate with SECURITY DEFINER
DROP FUNCTION IF EXISTS update_weekly_leaderboard_on_pick_change() CASCADE;
DROP FUNCTION IF EXISTS update_season_leaderboard_on_pick_change() CASCADE;

-- Weekly leaderboard trigger function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION update_weekly_leaderboard_on_pick_change()
RETURNS TRIGGER 
SECURITY DEFINER -- This allows the function to bypass RLS policies
AS $$
DECLARE
    user_display_name TEXT;
    user_stats RECORD;
    existing_entry RECORD;
    new_rank INTEGER;
BEGIN
    -- Get the user's display name
    SELECT display_name INTO user_display_name 
    FROM public.users 
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    IF user_display_name IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate new weekly stats for the affected user/week/season
    SELECT 
        COUNT(p.id) as picks_made,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points
    INTO user_stats
    FROM public.picks p
    WHERE p.user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND p.week = COALESCE(NEW.week, OLD.week)
      AND p.season = COALESCE(NEW.season, OLD.season);
    
    -- Check if entry exists
    SELECT * INTO existing_entry
    FROM public.weekly_leaderboard
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND week = COALESCE(NEW.week, OLD.week)
      AND season = COALESCE(NEW.season, OLD.season);
      
    -- Calculate new rank
    SELECT COUNT(*) + 1 INTO new_rank
    FROM public.weekly_leaderboard wl
    WHERE wl.week = COALESCE(NEW.week, OLD.week)
      AND wl.season = COALESCE(NEW.season, OLD.season)
      AND wl.total_points > user_stats.total_points;
    
    IF existing_entry IS NOT NULL THEN
        -- Update existing entry (preserve payment status)
        UPDATE public.weekly_leaderboard 
        SET 
            display_name = user_display_name,
            picks_made = user_stats.picks_made,
            wins = user_stats.wins,
            losses = user_stats.losses,
            pushes = user_stats.pushes,
            lock_wins = user_stats.lock_wins,
            lock_losses = user_stats.lock_losses,
            total_points = user_stats.total_points,
            weekly_rank = new_rank,
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry (preserve existing payment status if available)
        INSERT INTO public.weekly_leaderboard (
            user_id, display_name, week, season, picks_made, wins, losses, pushes,
            lock_wins, lock_losses, total_points, weekly_rank, payment_status, is_verified
        ) VALUES (
            COALESCE(NEW.user_id, OLD.user_id),
            user_display_name,
            COALESCE(NEW.week, OLD.week),
            COALESCE(NEW.season, OLD.season),
            user_stats.picks_made,
            user_stats.wins,
            user_stats.losses,
            user_stats.pushes,
            user_stats.lock_wins,
            user_stats.lock_losses,
            user_stats.total_points,
            new_rank,
            -- Get payment status from leaguesafe_payments if available
            COALESCE((
                SELECT status FROM public.leaguesafe_payments 
                WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) 
                AND season = COALESCE(NEW.season, OLD.season)
                AND is_matched = true
                LIMIT 1
            ), 'Unknown'),
            -- Get verification status
            COALESCE((
                SELECT (status = 'Paid' AND is_matched = true) FROM public.leaguesafe_payments 
                WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) 
                AND season = COALESCE(NEW.season, OLD.season)
                AND is_matched = true
                LIMIT 1
            ), false)
        );
    END IF;
    
    -- Update ranks for all entries in this week/season
    WITH ranked_entries AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, wins DESC) as new_rank
        FROM public.weekly_leaderboard
        WHERE week = COALESCE(NEW.week, OLD.week)
          AND season = COALESCE(NEW.season, OLD.season)
    )
    UPDATE public.weekly_leaderboard wl
    SET weekly_rank = re.new_rank
    FROM ranked_entries re
    WHERE wl.id = re.id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Season leaderboard trigger function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION update_season_leaderboard_on_pick_change()
RETURNS TRIGGER 
SECURITY DEFINER -- This allows the function to bypass RLS policies
AS $$
DECLARE
    user_display_name TEXT;
    user_stats RECORD;
    existing_entry RECORD;
    new_rank INTEGER;
BEGIN
    -- Get the user's display name
    SELECT display_name INTO user_display_name 
    FROM public.users 
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    IF user_display_name IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate new season stats for the affected user/season
    SELECT 
        COUNT(p.id) as total_picks,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points
    INTO user_stats
    FROM public.picks p
    WHERE p.user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND p.season = COALESCE(NEW.season, OLD.season);
    
    -- Check if entry exists
    SELECT * INTO existing_entry
    FROM public.season_leaderboard
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND season = COALESCE(NEW.season, OLD.season);
      
    -- Calculate new rank
    SELECT COUNT(*) + 1 INTO new_rank
    FROM public.season_leaderboard sl
    WHERE sl.season = COALESCE(NEW.season, OLD.season)
      AND sl.total_points > user_stats.total_points;
    
    IF existing_entry IS NOT NULL THEN
        -- Update existing entry (preserve payment status)
        UPDATE public.season_leaderboard 
        SET 
            display_name = user_display_name,
            total_picks = user_stats.total_picks,
            total_wins = user_stats.total_wins,
            total_losses = user_stats.total_losses,
            total_pushes = user_stats.total_pushes,
            lock_wins = user_stats.lock_wins,
            lock_losses = user_stats.lock_losses,
            total_points = user_stats.total_points,
            season_rank = new_rank,
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry (preserve existing payment status if available)
        INSERT INTO public.season_leaderboard (
            user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
            lock_wins, lock_losses, total_points, season_rank, payment_status, is_verified
        ) VALUES (
            COALESCE(NEW.user_id, OLD.user_id),
            user_display_name,
            COALESCE(NEW.season, OLD.season),
            user_stats.total_picks,
            user_stats.total_wins,
            user_stats.total_losses,
            user_stats.total_pushes,
            user_stats.lock_wins,
            user_stats.lock_losses,
            user_stats.total_points,
            new_rank,
            -- Get payment status from leaguesafe_payments if available
            COALESCE((
                SELECT status FROM public.leaguesafe_payments 
                WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) 
                AND season = COALESCE(NEW.season, OLD.season)
                AND is_matched = true
                LIMIT 1
            ), 'Unknown'),
            -- Get verification status
            COALESCE((
                SELECT (status = 'Paid' AND is_matched = true) FROM public.leaguesafe_payments 
                WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) 
                AND season = COALESCE(NEW.season, OLD.season)
                AND is_matched = true
                LIMIT 1
            ), false)
        );
    END IF;
    
    -- Update ranks for all entries in this season
    WITH ranked_entries AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY total_points DESC, total_wins DESC) as new_rank
        FROM public.season_leaderboard
        WHERE season = COALESCE(NEW.season, OLD.season)
    )
    UPDATE public.season_leaderboard sl
    SET season_rank = re.new_rank
    FROM ranked_entries re
    WHERE sl.id = re.id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Recreate the triggers
CREATE TRIGGER picks_weekly_leaderboard_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.picks
    FOR EACH ROW
    EXECUTE FUNCTION update_weekly_leaderboard_on_pick_change();

CREATE TRIGGER picks_season_leaderboard_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.picks
    FOR EACH ROW
    EXECUTE FUNCTION update_season_leaderboard_on_pick_change();

-- Add comments
COMMENT ON FUNCTION update_weekly_leaderboard_on_pick_change() IS 'Updates weekly_leaderboard table when picks are modified - runs with SECURITY DEFINER to bypass RLS';
COMMENT ON FUNCTION update_season_leaderboard_on_pick_change() IS 'Updates season_leaderboard table when picks are modified - runs with SECURITY DEFINER to bypass RLS';