-- EMERGENCY DATA POPULATION - Run if leaderboard tables are empty

-- Check if we have any season data
DO $$
DECLARE
    season_count INTEGER;
    picks_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO season_count FROM public.season_leaderboard WHERE season = 2024;
    SELECT COUNT(*) INTO picks_count FROM public.picks WHERE season = 2024 AND result IS NOT NULL;
    
    RAISE NOTICE 'Current season leaderboard entries: %', season_count;
    RAISE NOTICE 'Available picks with results: %', picks_count;
    
    IF season_count = 0 AND picks_count > 0 THEN
        RAISE NOTICE 'Populating season leaderboard...';
        
        -- Simple season leaderboard population
        INSERT INTO public.season_leaderboard (
            user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
            lock_wins, lock_losses, total_points, payment_status, is_verified
        )
        SELECT 
            p.user_id,
            u.display_name,
            2024 as season,
            COUNT(p.id) as total_picks,
            COUNT(CASE WHEN p.result = 'win' THEN 1 END) as total_wins,
            COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as total_losses,
            COUNT(CASE WHEN p.result = 'push' THEN 1 END) as total_pushes,
            COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
            COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
            COALESCE(SUM(p.points_earned), 0) as total_points,
            COALESCE(lsp.status, 'NotPaid') as payment_status,
            COALESCE((lsp.status = 'Paid' AND lsp.is_matched = TRUE), FALSE) as is_verified
        FROM public.picks p
        JOIN public.users u ON u.id = p.user_id
        LEFT JOIN public.leaguesafe_payments lsp ON lsp.user_id = p.user_id AND lsp.season = 2024
        WHERE p.season = 2024
            AND p.result IS NOT NULL
        GROUP BY p.user_id, u.display_name, lsp.status, lsp.is_matched
        HAVING COUNT(p.id) > 0;
        
        -- Add rankings
        UPDATE public.season_leaderboard 
        SET season_rank = subq.rank
        FROM (
            SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
            FROM public.season_leaderboard
            WHERE season = 2024
        ) subq
        WHERE public.season_leaderboard.id = subq.id;
        
        SELECT COUNT(*) INTO season_count FROM public.season_leaderboard WHERE season = 2024;
        RAISE NOTICE 'Populated % season entries', season_count;
    ELSE
        RAISE NOTICE 'Season leaderboard already has data or no picks available';
    END IF;
END $$;