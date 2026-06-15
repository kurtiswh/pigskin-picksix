-- EMERGENCY RLS FIX - Run this in Supabase SQL Editor immediately
-- This removes the expensive user table joins that are causing timeouts

-- Step 1: Drop problematic RLS policies
DROP POLICY IF EXISTS "Anyone can view weekly leaderboard" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "Only admins can modify weekly leaderboard" ON public.weekly_leaderboard;
DROP POLICY IF EXISTS "Anyone can view season leaderboard" ON public.season_leaderboard;
DROP POLICY IF EXISTS "Only admins can modify season leaderboard" ON public.season_leaderboard;

-- Step 2: Create simple RLS policies (no joins = no timeouts)
CREATE POLICY "Public read weekly leaderboard" ON public.weekly_leaderboard 
    FOR SELECT USING (true);

CREATE POLICY "Public read season leaderboard" ON public.season_leaderboard 
    FOR SELECT USING (true);

-- Step 3: Allow service role to write (for triggers)
CREATE POLICY "Service write weekly leaderboard" ON public.weekly_leaderboard 
    FOR ALL USING (current_setting('role') = 'service_role');

CREATE POLICY "Service write season leaderboard" ON public.season_leaderboard 
    FOR ALL USING (current_setting('role') = 'service_role');

-- Verify tables exist and check data
SELECT 'season_leaderboard' as table_name, COUNT(*) as total_rows, COUNT(*) FILTER (WHERE is_verified = true) as verified_rows
FROM public.season_leaderboard WHERE season = 2024
UNION ALL
SELECT 'weekly_leaderboard' as table_name, COUNT(*) as total_rows, COUNT(*) FILTER (WHERE is_verified = true) as verified_rows  
FROM public.weekly_leaderboard WHERE season = 2024 AND week = 1;