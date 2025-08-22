-- Migration: Verify and populate leaderboard tables for current season
--
-- Problem: Leaderboard tables may be empty, causing timeout issues
-- Solution: Ensure tables are populated with current season data

-- Function to populate/refresh leaderboard data for a specific season
CREATE OR REPLACE FUNCTION public.populate_leaderboard_data(target_season INTEGER DEFAULT 2024)
RETURNS TEXT AS $$
DECLARE
    result_text TEXT := '';
    weekly_count INTEGER := 0;
    season_count INTEGER := 0;
    max_week INTEGER := 0;
    current_week INTEGER;
BEGIN
    -- Get the maximum week for the season
    SELECT COALESCE(MAX(week), 0) INTO max_week
    FROM public.games 
    WHERE season = target_season;
    
    result_text := result_text || 'Found ' || max_week || ' weeks of games for season ' || target_season || E'\n';
    
    -- Clear existing leaderboard data for the season
    DELETE FROM public.weekly_leaderboard WHERE season = target_season;
    DELETE FROM public.season_leaderboard WHERE season = target_season;
    
    result_text := result_text || 'Cleared existing leaderboard data for season ' || target_season || E'\n';
    
    -- Populate weekly leaderboard for each week
    FOR current_week IN 1..max_week LOOP
        INSERT INTO public.weekly_leaderboard (
            user_id, display_name, week, season, picks_made, wins, losses, pushes,
            lock_wins, lock_losses, total_points, payment_status, is_verified
        )
        SELECT 
            p.user_id,
            u.display_name,
            current_week,
            target_season,
            COUNT(p.id) as picks_made,
            COUNT(CASE WHEN p.result = 'win' THEN 1 END) as wins,
            COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as losses,
            COUNT(CASE WHEN p.result = 'push' THEN 1 END) as pushes,
            COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
            COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
            COALESCE(SUM(p.points_earned), 0) as total_points,
            -- Get payment status from leaguesafe_payments
            COALESCE(lsp.status, 'NotPaid') as payment_status,
            COALESCE((lsp.status = 'Paid' AND lsp.is_matched = TRUE), FALSE) as is_verified
        FROM public.picks p
        JOIN public.users u ON u.id = p.user_id
        LEFT JOIN public.leaguesafe_payments lsp ON lsp.user_id = p.user_id AND lsp.season = target_season
        WHERE p.season = target_season 
            AND p.week = current_week
            AND p.result IS NOT NULL -- Only include picks with results
        GROUP BY p.user_id, u.display_name, lsp.status, lsp.is_matched
        HAVING COUNT(p.id) > 0; -- Only include users with picks
        
        GET DIAGNOSTICS weekly_count = ROW_COUNT;
        result_text := result_text || 'Populated ' || weekly_count || ' entries for week ' || current_week || E'\n';
    END LOOP;
    
    -- Update weekly rankings
    FOR current_week IN 1..max_week LOOP
        UPDATE public.weekly_leaderboard 
        SET weekly_rank = subq.rank
        FROM (
            SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
            FROM public.weekly_leaderboard
            WHERE week = current_week AND season = target_season
        ) subq
        WHERE public.weekly_leaderboard.id = subq.id;
    END LOOP;
    
    result_text := result_text || 'Updated weekly rankings for all weeks' || E'\n';
    
    -- Populate season leaderboard
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified
    )
    SELECT 
        p.user_id,
        u.display_name,
        target_season,
        COUNT(p.id) as total_picks,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points,
        -- Get payment status from leaguesafe_payments
        COALESCE(lsp.status, 'NotPaid') as payment_status,
        COALESCE((lsp.status = 'Paid' AND lsp.is_matched = TRUE), FALSE) as is_verified
    FROM public.picks p
    JOIN public.users u ON u.id = p.user_id
    LEFT JOIN public.leaguesafe_payments lsp ON lsp.user_id = p.user_id AND lsp.season = target_season
    WHERE p.season = target_season
        AND p.result IS NOT NULL -- Only include picks with results
    GROUP BY p.user_id, u.display_name, lsp.status, lsp.is_matched
    HAVING COUNT(p.id) > 0; -- Only include users with picks
    
    GET DIAGNOSTICS season_count = ROW_COUNT;
    result_text := result_text || 'Populated ' || season_count || ' season entries' || E'\n';
    
    -- Update season rankings
    UPDATE public.season_leaderboard 
    SET season_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.season_leaderboard
        WHERE season = target_season
    ) subq
    WHERE public.season_leaderboard.id = subq.id;
    
    result_text := result_text || 'Updated season rankings' || E'\n';
    
    -- Return summary
    result_text := result_text || 'COMPLETE: Populated leaderboard data for season ' || target_season;
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;

-- Execute the population for 2024 season
SELECT public.populate_leaderboard_data(2024);

-- Verify the results
DO $$
DECLARE
    weekly_verified INTEGER := 0;
    season_verified INTEGER := 0;
    total_weekly INTEGER := 0;
    total_season INTEGER := 0;
BEGIN
    SELECT COUNT(*) INTO total_weekly FROM public.weekly_leaderboard WHERE season = 2024;
    SELECT COUNT(*) INTO weekly_verified FROM public.weekly_leaderboard WHERE season = 2024 AND is_verified = true;
    SELECT COUNT(*) INTO total_season FROM public.season_leaderboard WHERE season = 2024;
    SELECT COUNT(*) INTO season_verified FROM public.season_leaderboard WHERE season = 2024 AND is_verified = true;
    
    RAISE NOTICE 'VERIFICATION RESULTS:';
    RAISE NOTICE 'Weekly leaderboard: % total entries, % verified', total_weekly, weekly_verified;
    RAISE NOTICE 'Season leaderboard: % total entries, % verified', total_season, season_verified;
    
    IF total_season = 0 THEN
        RAISE WARNING 'No season leaderboard entries found - check picks data!';
    END IF;
    
    IF season_verified = 0 THEN
        RAISE WARNING 'No verified users found - check leaguesafe_payments data!';
    END IF;
END $$;

-- Add comments
COMMENT ON FUNCTION public.populate_leaderboard_data(INTEGER) IS 
    'Refreshes leaderboard tables with current picks data and payment status for the specified season';