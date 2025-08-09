-- Function to get weekly leaderboard for email notifications
-- This function is used by the email service to calculate user rankings

CREATE OR REPLACE FUNCTION get_weekly_leaderboard(
  season_param INTEGER,
  week_param INTEGER
)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  total_points INTEGER,
  wins INTEGER,
  losses INTEGER,
  pushes INTEGER,
  rank INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH user_stats AS (
    SELECT 
      u.id as user_id,
      u.display_name,
      COALESCE(SUM(p.points_earned), 0)::INTEGER as total_points,
      COUNT(CASE WHEN p.result = 'win' THEN 1 END)::INTEGER as wins,
      COUNT(CASE WHEN p.result = 'loss' THEN 1 END)::INTEGER as losses,
      COUNT(CASE WHEN p.result = 'push' THEN 1 END)::INTEGER as pushes
    FROM users u
    LEFT JOIN picks p ON u.id = p.user_id 
      AND p.season = season_param 
      AND p.week = week_param 
      AND p.submitted = true
    GROUP BY u.id, u.display_name
    HAVING COUNT(CASE WHEN p.submitted = true THEN 1 END) > 0  -- Only include users who submitted picks
  ),
  ranked_stats AS (
    SELECT 
      *,
      RANK() OVER (ORDER BY total_points DESC, wins DESC, losses ASC)::INTEGER as rank
    FROM user_stats
  )
  SELECT 
    rs.user_id,
    rs.display_name,
    rs.total_points,
    rs.wins,
    rs.losses, 
    rs.pushes,
    rs.rank
  FROM ranked_stats rs
  ORDER BY rs.rank;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;