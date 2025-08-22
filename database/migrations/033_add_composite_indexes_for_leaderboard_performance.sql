-- Migration: Add composite indexes for optimal leaderboard query performance
-- 
-- Problem: Current indexes are single-column, not optimized for common query patterns
-- Solution: Add composite indexes for the most frequent query combinations

-- Drop existing single-column indexes that will be replaced by composite ones
DROP INDEX IF EXISTS idx_weekly_leaderboard_is_verified;
DROP INDEX IF EXISTS idx_season_leaderboard_is_verified;
DROP INDEX IF EXISTS idx_weekly_leaderboard_week_season;
DROP INDEX IF EXISTS idx_season_leaderboard_season;

-- Add optimized composite indexes for weekly leaderboard
-- This covers the common query: WHERE season = X AND week = Y AND is_verified = true ORDER BY weekly_rank
CREATE INDEX idx_weekly_leaderboard_season_week_verified_rank ON public.weekly_leaderboard(season, week, is_verified, weekly_rank) 
    WHERE is_verified = true;

-- Index for queries without verification filter (fallback queries)
CREATE INDEX idx_weekly_leaderboard_season_week_rank ON public.weekly_leaderboard(season, week, weekly_rank);

-- Add optimized composite indexes for season leaderboard  
-- This covers the common query: WHERE season = X AND is_verified = true ORDER BY season_rank
CREATE INDEX idx_season_leaderboard_season_verified_rank ON public.season_leaderboard(season, is_verified, season_rank) 
    WHERE is_verified = true;

-- Index for queries without verification filter (fallback queries)
CREATE INDEX idx_season_leaderboard_season_rank ON public.season_leaderboard(season, season_rank);

-- Keep the existing payment status indexes as they're still useful for admin queries
-- (but don't recreate them if they already exist)
CREATE INDEX IF NOT EXISTS idx_weekly_leaderboard_payment_status ON public.weekly_leaderboard(payment_status);
CREATE INDEX IF NOT EXISTS idx_season_leaderboard_payment_status ON public.season_leaderboard(payment_status);

-- Add performance monitoring comments
COMMENT ON INDEX idx_weekly_leaderboard_season_week_verified_rank IS 
    'Optimized for: SELECT * FROM weekly_leaderboard WHERE season = X AND week = Y AND is_verified = true ORDER BY weekly_rank';

COMMENT ON INDEX idx_season_leaderboard_season_verified_rank IS 
    'Optimized for: SELECT * FROM season_leaderboard WHERE season = X AND is_verified = true ORDER BY season_rank';

COMMENT ON INDEX idx_weekly_leaderboard_season_week_rank IS 
    'Fallback index for queries without is_verified filter';

COMMENT ON INDEX idx_season_leaderboard_season_rank IS 
    'Fallback index for queries without is_verified filter';