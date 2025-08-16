-- Fix RLS policies for games table to ensure anonymous access works
-- The games table should be publicly readable for leaderboard functionality

-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Anyone can view games" ON public.games;
DROP POLICY IF EXISTS "Only admins can modify games" ON public.games;

-- Create a simple public read policy that definitely works
CREATE POLICY "Public games read access" ON public.games
  FOR SELECT TO anon, authenticated
  USING (true);

-- Recreate admin write policy
CREATE POLICY "Admin games write access" ON public.games
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

-- Ensure proper permissions are granted
GRANT SELECT ON public.games TO anon;
GRANT SELECT ON public.games TO authenticated;
GRANT ALL ON public.games TO authenticated;

-- Add comment for documentation
COMMENT ON POLICY "Public games read access" ON public.games IS 'Allow anonymous and authenticated users to read games for leaderboard functionality';