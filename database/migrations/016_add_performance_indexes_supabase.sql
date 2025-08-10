-- Add database indexes to improve query performance (Supabase version)
-- This should significantly speed up common query patterns
-- Note: Removed CONCURRENTLY keyword for Supabase compatibility

-- Games table indexes
CREATE INDEX IF NOT EXISTS idx_games_week_season 
ON public.games (week, season);

CREATE INDEX IF NOT EXISTS idx_games_status 
ON public.games (status);

CREATE INDEX IF NOT EXISTS idx_games_kickoff_time 
ON public.games (kickoff_time);

-- Picks table indexes (most critical for performance)
CREATE INDEX IF NOT EXISTS idx_picks_user_id 
ON public.picks (user_id);

CREATE INDEX IF NOT EXISTS idx_picks_game_id 
ON public.picks (game_id);

CREATE INDEX IF NOT EXISTS idx_picks_week_season 
ON public.picks (week, season);

CREATE INDEX IF NOT EXISTS idx_picks_user_week_season 
ON public.picks (user_id, week, season);

CREATE INDEX IF NOT EXISTS idx_picks_season 
ON public.picks (season);

CREATE INDEX IF NOT EXISTS idx_picks_result 
ON public.picks (result);

CREATE INDEX IF NOT EXISTS idx_picks_submitted 
ON public.picks (submitted);

-- Week settings indexes
CREATE INDEX IF NOT EXISTS idx_week_settings_week_season 
ON public.week_settings (week, season);

CREATE INDEX IF NOT EXISTS idx_week_settings_picks_open 
ON public.week_settings (picks_open);

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email 
ON public.users (email);

CREATE INDEX IF NOT EXISTS idx_users_is_admin 
ON public.users (is_admin);

-- LeagueSafe payments indexes (if the table exists)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leaguesafe_payments') THEN
        CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_season 
        ON public.leaguesafe_payments (season);
        
        CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_status 
        ON public.leaguesafe_payments (status);
        
        CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_user_id 
        ON public.leaguesafe_payments (user_id);
        
        CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_email 
        ON public.leaguesafe_payments (leaguesafe_email);
        
        CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_matched 
        ON public.leaguesafe_payments (is_matched);
    END IF;
END $$;

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_picks_season_status_user 
ON public.picks (season, result, user_id) WHERE result IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_picks_lock_result 
ON public.picks (is_lock, result) WHERE is_lock = true AND result IS NOT NULL;

-- Analyze tables to update query planner statistics
ANALYZE public.users;
ANALYZE public.games;
ANALYZE public.picks;
ANALYZE public.week_settings;