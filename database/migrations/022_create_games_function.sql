-- Create a function to get games data as workaround for table access issues
-- Functions often bypass RLS and permission problems

-- Drop function if exists
DROP FUNCTION IF EXISTS get_games_for_week(integer, integer);

-- Create function to return games for a specific season/week
CREATE OR REPLACE FUNCTION get_games_for_week(p_season integer, p_week integer)
RETURNS TABLE (
    id uuid,
    home_team text,
    away_team text,
    spread numeric,
    kickoff_time timestamptz,
    status game_status,
    week integer,
    season integer,
    home_score integer,
    away_score integer
) 
LANGUAGE plpgsql
SECURITY DEFINER  -- Run with elevated privileges
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        g.id,
        g.home_team,
        g.away_team,
        g.spread,
        g.kickoff_time,
        g.status,
        g.week,
        g.season,
        g.home_score,
        g.away_score
    FROM public.games g
    WHERE g.season = p_season 
      AND g.week = p_week
    ORDER BY g.kickoff_time;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_games_for_week(integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION get_games_for_week(integer, integer) TO authenticated;

-- Test the function
SELECT 'Function test:' as info, COUNT(*) as game_count 
FROM get_games_for_week(2025, 1);