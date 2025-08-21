-- Enable anonymous read access for leaderboard functionality
-- This allows the leaderboard to work without authentication while respecting privacy rules

-- 1. Enable anonymous read access to leaguesafe_payments
CREATE POLICY "anonymous_read_payments" ON public.leaguesafe_payments
    FOR SELECT USING (true);

-- 2. Enable anonymous read access to games table
CREATE POLICY "anonymous_read_games" ON public.games
    FOR SELECT USING (true);

-- 3. Enable anonymous read access to picks table 
-- Note: This will be enhanced later to respect pick privacy until games are locked
CREATE POLICY "anonymous_read_picks" ON public.picks
    FOR SELECT USING (true);

-- 4. Enable anonymous read access to anonymous_picks table
CREATE POLICY "anonymous_read_anonymous_picks" ON public.anonymous_picks
    FOR SELECT USING (true);

-- 5. Enable anonymous read access to users table for display names
CREATE POLICY "anonymous_read_users" ON public.users
    FOR SELECT USING (true);

-- 6. Enable anonymous read access to week_settings for lock status
CREATE POLICY "anonymous_read_week_settings" ON public.week_settings
    FOR SELECT USING (true);

-- Verification queries
DO $$
BEGIN
    RAISE NOTICE 'Anonymous read access policies created for leaderboard functionality';
    RAISE NOTICE 'Tables affected: leaguesafe_payments, games, picks, anonymous_picks, users, week_settings';
    RAISE NOTICE 'Note: Pick privacy controls will be implemented in application logic';
END $$;

-- Show current RLS policies for verification
SELECT 
    schemaname, 
    tablename, 
    policyname, 
    cmd,
    roles
FROM pg_policies 
WHERE schemaname = 'public' 
    AND tablename IN ('leaguesafe_payments', 'games', 'picks', 'anonymous_picks', 'users', 'week_settings')
ORDER BY tablename, policyname;