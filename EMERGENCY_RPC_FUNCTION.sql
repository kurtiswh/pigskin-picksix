-- Emergency RPC Function for Direct Leaderboard Calculation
-- Run this in Supabase SQL Editor if the emergency service needs it

CREATE OR REPLACE FUNCTION public.get_emergency_leaderboard(target_season INTEGER)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  season_rank INTEGER,
  total_points INTEGER,
  total_wins INTEGER,
  total_losses INTEGER,
  total_pushes INTEGER,
  lock_wins INTEGER,
  lock_losses INTEGER
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id as user_id,
    u.display_name,
    RANK() OVER (ORDER BY COALESCE(SUM(p.points_earned), 0) DESC)::INTEGER as season_rank,
    COALESCE(SUM(p.points_earned), 0)::INTEGER as total_points,
    COUNT(CASE WHEN p.result = 'win' THEN 1 END)::INTEGER as total_wins,
    COUNT(CASE WHEN p.result = 'loss' THEN 1 END)::INTEGER as total_losses,
    COUNT(CASE WHEN p.result = 'push' THEN 1 END)::INTEGER as total_pushes,
    COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END)::INTEGER as lock_wins,
    COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END)::INTEGER as lock_losses
  FROM public.users u
  LEFT JOIN public.picks p ON u.id = p.user_id 
    AND p.season = target_season 
    AND p.result IS NOT NULL
  GROUP BY u.id, u.display_name
  HAVING COUNT(p.id) > 0  -- Only users with picks
  ORDER BY total_points DESC
  LIMIT 50;
END;
$$;

-- Grant access to anonymous users
GRANT EXECUTE ON FUNCTION public.get_emergency_leaderboard(INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.get_emergency_leaderboard(INTEGER) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_emergency_leaderboard(INTEGER) IS 
    'Emergency leaderboard calculation directly from picks table - always works if picks exist';

-- Test the function
SELECT * FROM public.get_emergency_leaderboard(2024) LIMIT 5;