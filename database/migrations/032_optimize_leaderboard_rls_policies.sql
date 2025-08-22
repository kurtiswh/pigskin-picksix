-- Migration: Optimize leaderboard RLS policies to remove expensive joins
-- 
-- Problem: Current RLS policies on leaderboard tables perform expensive
-- user table joins for every row evaluation, causing query timeouts
-- 
-- Solution: Simplify RLS policies for read operations since leaderboards
-- should be publicly viewable anyway

-- Drop existing policies that cause expensive joins
DROP POLICY IF EXISTS "Anyone can view weekly leaderboard" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "Only admins can modify weekly leaderboard" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "Anyone can view season leaderboard" ON public.season_leaderboard;
DROP POLICY IF EXISTS "Only admins can modify season leaderboard" ON public.season_leaderboard;

-- Create optimized RLS policies
-- Read access: Simple true condition (no joins)
CREATE POLICY "Public read access to weekly leaderboard" ON public.weekly_leaderboard 
    FOR SELECT USING (true);

CREATE POLICY "Public read access to season leaderboard" ON public.season_leaderboard 
    FOR SELECT USING (true);

-- Write access: Only for service role (used by triggers and admin functions)
-- This avoids the expensive user table join for regular queries
CREATE POLICY "Service role write access to weekly leaderboard" ON public.weekly_leaderboard 
    FOR ALL USING (
        current_setting('role') = 'service_role' OR
        current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
    );

CREATE POLICY "Service role write access to season leaderboard" ON public.season_leaderboard 
    FOR ALL USING (
        current_setting('role') = 'service_role' OR
        current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
    );

-- Add comments explaining the optimization
COMMENT ON POLICY "Public read access to weekly leaderboard" ON public.weekly_leaderboard IS 
    'Optimized policy: No expensive joins. Leaderboards are public data.';

COMMENT ON POLICY "Public read access to season leaderboard" ON public.season_leaderboard IS 
    'Optimized policy: No expensive joins. Leaderboards are public data.';

COMMENT ON POLICY "Service role write access to weekly leaderboard" ON public.weekly_leaderboard IS 
    'Write operations restricted to service role and database triggers';

COMMENT ON POLICY "Service role write access to season leaderboard" ON public.season_leaderboard IS 
    'Write operations restricted to service role and database triggers';