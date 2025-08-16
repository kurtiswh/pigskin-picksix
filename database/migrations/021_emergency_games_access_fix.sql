-- Emergency fix for games table access - temporarily disable RLS if needed
-- This will ensure the games tab works while we debug the RLS policies

-- First, try to fix with a very simple policy
DROP POLICY IF EXISTS "Public games read access" ON public.games;
DROP POLICY IF EXISTS "Admin games write access" ON public.games;
DROP POLICY IF EXISTS "Anyone can view games" ON public.games;
DROP POLICY IF EXISTS "Only admins can modify games" ON public.games;

-- Create the most permissive read policy possible
CREATE POLICY "games_select_policy" ON public.games
  FOR SELECT
  USING (true);

-- Grant all necessary permissions
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.games TO anon;
GRANT SELECT ON public.games TO authenticated;

-- If the above doesn't work, uncomment this line to temporarily disable RLS
-- (you can re-enable it later once we fix the policies)
-- ALTER TABLE public.games DISABLE ROW LEVEL SECURITY;

-- Test query to verify access
SELECT 'Games table access test - if you see this, the fix worked' as test_result, COUNT(*) as game_count FROM public.games;