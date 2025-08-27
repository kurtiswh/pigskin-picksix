-- Migration 051: Add Leaderboard Refresh Utilities
-- This migration provides admin utilities to refresh existing leaderboard entries
-- with proper pick_source attribution when needed.

-- Function to manually refresh season leaderboard pick_source for all users
CREATE OR REPLACE FUNCTION refresh_season_leaderboard_sources()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  refresh_count INTEGER := 0;
  user_record RECORD;
BEGIN
  -- Loop through all season leaderboard entries
  FOR user_record IN 
    SELECT DISTINCT user_id, season FROM season_leaderboard
  LOOP
    -- Use the enhanced function to update this user's entry
    PERFORM update_season_leaderboard_with_source(user_record.user_id, user_record.season);
    refresh_count := refresh_count + 1;
  END LOOP;
  
  RETURN refresh_count;
END;
$$;

-- Function to manually refresh weekly leaderboard pick_source for specific week/season
CREATE OR REPLACE FUNCTION refresh_weekly_leaderboard_sources(target_season INTEGER, target_week INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER  
AS $$
DECLARE
  refresh_count INTEGER := 0;
  user_record RECORD;
BEGIN
  -- Loop through all weekly leaderboard entries for the target week/season
  FOR user_record IN 
    SELECT DISTINCT user_id FROM weekly_leaderboard 
    WHERE season = target_season AND week = target_week
  LOOP
    -- Use the enhanced function to update this user's entry
    PERFORM update_weekly_leaderboard_with_source(user_record.user_id, target_season, target_week);
    refresh_count := refresh_count + 1;
  END LOOP;
  
  RETURN refresh_count;
END;
$$;

-- Function to refresh all weekly leaderboard entries for a season
CREATE OR REPLACE FUNCTION refresh_all_weekly_leaderboard_sources(target_season INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  refresh_count INTEGER := 0;
  week_record RECORD;
BEGIN
  -- Loop through all weeks in the season
  FOR week_record IN 
    SELECT DISTINCT week FROM weekly_leaderboard WHERE season = target_season
  LOOP
    refresh_count := refresh_count + refresh_weekly_leaderboard_sources(target_season, week_record.week);
  END LOOP;
  
  RETURN refresh_count;
END;
$$;

-- Function to get pick source statistics for debugging
CREATE OR REPLACE FUNCTION get_pick_source_stats(target_season INTEGER)
RETURNS TABLE (
  source_type TEXT,
  season_count INTEGER,
  weekly_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(s.pick_source, 'null') as source_type,
    COUNT(DISTINCT s.user_id)::INTEGER as season_count,
    COUNT(DISTINCT w.user_id)::INTEGER as weekly_count
  FROM season_leaderboard s
  FULL OUTER JOIN weekly_leaderboard w ON s.user_id = w.user_id AND s.season = w.season
  WHERE s.season = target_season OR w.season = target_season
  GROUP BY COALESCE(s.pick_source, 'null')
  ORDER BY season_count DESC;
END;
$$;

-- Grant execute permissions to authenticated users (admins)
GRANT EXECUTE ON FUNCTION refresh_season_leaderboard_sources() TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_weekly_leaderboard_sources(INTEGER, INTEGER) TO authenticated;  
GRANT EXECUTE ON FUNCTION refresh_all_weekly_leaderboard_sources(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_pick_source_stats(INTEGER) TO authenticated;

-- Usage examples (commented out):
-- SELECT refresh_season_leaderboard_sources(); -- Refresh all season entries
-- SELECT refresh_weekly_leaderboard_sources(2024, 1); -- Refresh specific week  
-- SELECT refresh_all_weekly_leaderboard_sources(2024); -- Refresh all weeks for season
-- SELECT * FROM get_pick_source_stats(2024); -- View current source distribution