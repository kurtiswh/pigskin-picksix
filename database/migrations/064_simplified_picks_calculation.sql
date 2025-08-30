-- Simplified picks calculation using games table as single source of truth
-- When a game is completed, picks are scored by matching selected_team to winner_against_spread
-- Points = base_points + margin_bonus + (if lock, margin_bonus again)

-- Step 1: Create simplified pick calculation function
CREATE OR REPLACE FUNCTION public.calculate_pick_from_game(
    selected_team TEXT,
    is_lock BOOLEAN,
    winner_against_spread TEXT,
    base_points INTEGER,
    margin_bonus INTEGER
)
RETURNS TABLE(result pick_result, points_earned INTEGER)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Handle null/incomplete games
    IF winner_against_spread IS NULL THEN
        RETURN QUERY SELECT NULL::pick_result, NULL::INTEGER;
        RETURN;
    END IF;
    
    -- Check if pick matches ATS winner
    IF selected_team = winner_against_spread THEN
        -- Win: base_points + margin_bonus + (if lock, margin_bonus again)
        RETURN QUERY SELECT 
            'win'::pick_result,
            (base_points + margin_bonus + CASE WHEN is_lock THEN margin_bonus ELSE 0 END);
    ELSIF winner_against_spread = 'push' THEN
        -- Push: 10 points regardless of lock status
        RETURN QUERY SELECT 'push'::pick_result, 10;
    ELSE
        -- Loss: 0 points
        RETURN QUERY SELECT 'loss'::pick_result, 0;
    END IF;
END;
$$;

-- Step 2: Update the recalculate_weekly_leaderboard trigger function to use games table
CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard()
RETURNS TRIGGER AS $$
DECLARE
    user_record RECORD;
    existing_entry RECORD;
BEGIN
    -- Get the user's display name
    SELECT display_name INTO user_record 
    FROM public.users 
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    IF user_record IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate new weekly stats for the affected user/week/season
    -- Use games table as source of truth for all calculations
    SELECT 
        COUNT(p.id) as picks_made,
        COUNT(CASE WHEN calc.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN calc.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN calc.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN calc.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN calc.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(calc.points_earned), 0) as total_points
    INTO user_record
    FROM public.picks p 
    JOIN public.games g ON p.game_id = g.id
    CROSS JOIN LATERAL public.calculate_pick_from_game(
        p.selected_team, 
        p.is_lock, 
        g.winner_against_spread, 
        g.base_points, 
        g.margin_bonus
    ) calc
    WHERE p.user_id = COALESCE(NEW.user_id, OLD.user_id) 
        AND p.week = COALESCE(NEW.week, OLD.week) 
        AND p.season = COALESCE(NEW.season, OLD.season);
    
    -- Check if weekly leaderboard entry exists
    SELECT * INTO existing_entry
    FROM public.weekly_leaderboard 
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
        AND week = COALESCE(NEW.week, OLD.week)
        AND season = COALESCE(NEW.season, OLD.season);
    
    IF existing_entry IS NOT NULL THEN
        -- Update existing entry
        UPDATE public.weekly_leaderboard 
        SET 
            picks_made = user_record.picks_made,
            wins = user_record.wins,
            losses = user_record.losses,
            pushes = user_record.pushes,
            lock_wins = user_record.lock_wins,
            lock_losses = user_record.lock_losses,
            total_points = user_record.total_points,
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry (preserve existing payment status if available)
        INSERT INTO public.weekly_leaderboard (
            user_id, display_name, week, season, picks_made, wins, losses, pushes,
            lock_wins, lock_losses, total_points, payment_status, is_verified
        ) VALUES (
            COALESCE(NEW.user_id, OLD.user_id),
            (SELECT display_name FROM public.users WHERE id = COALESCE(NEW.user_id, OLD.user_id)),
            COALESCE(NEW.week, OLD.week),
            COALESCE(NEW.season, OLD.season),
            user_record.picks_made,
            user_record.wins,
            user_record.losses,
            user_record.pushes,
            user_record.lock_wins,
            user_record.lock_losses,
            user_record.total_points,
            -- Get payment status from leaguesafe_payments if available
            COALESCE((
                SELECT CASE 
                    WHEN status = 'Paid' THEN 'Paid'
                    WHEN status = 'Pending' THEN 'Pending' 
                    ELSE 'NotPaid'
                END FROM public.leaguesafe_payments 
                WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) 
                    AND season = COALESCE(NEW.season, OLD.season)
            ), 'NotPaid'),
            -- Get verified status from leaguesafe_payments if available
            COALESCE((
                SELECT (status = 'Paid' AND is_matched = TRUE) 
                FROM public.leaguesafe_payments 
                WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) 
                    AND season = COALESCE(NEW.season, OLD.season)
            ), FALSE)
        );
    END IF;
    
    -- Recalculate rankings for this week/season
    UPDATE public.weekly_leaderboard 
    SET weekly_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.weekly_leaderboard
        WHERE week = COALESCE(NEW.week, OLD.week) 
            AND season = COALESCE(NEW.season, OLD.season)
    ) subq
    WHERE public.weekly_leaderboard.id = subq.id
        AND public.weekly_leaderboard.week = COALESCE(NEW.week, OLD.week)
        AND public.weekly_leaderboard.season = COALESCE(NEW.season, OLD.season);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 3: Update the recalculate_season_leaderboard trigger function to use games table
CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard()
RETURNS TRIGGER AS $$
DECLARE
    user_record RECORD;
    existing_entry RECORD;
BEGIN
    -- Get the user's display name
    SELECT display_name INTO user_record 
    FROM public.users 
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    IF user_record IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate new season stats for the affected user/season
    -- Use games table as source of truth for all calculations
    SELECT 
        COUNT(p.id) as total_picks,
        COUNT(CASE WHEN calc.result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN calc.result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN calc.result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN calc.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN calc.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(calc.points_earned), 0) as total_points
    INTO user_record
    FROM public.picks p 
    JOIN public.games g ON p.game_id = g.id
    CROSS JOIN LATERAL public.calculate_pick_from_game(
        p.selected_team, 
        p.is_lock, 
        g.winner_against_spread, 
        g.base_points, 
        g.margin_bonus
    ) calc
    WHERE p.user_id = COALESCE(NEW.user_id, OLD.user_id) 
        AND p.season = COALESCE(NEW.season, OLD.season);
    
    -- Check if season leaderboard entry exists
    SELECT * INTO existing_entry
    FROM public.season_leaderboard 
    WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
        AND season = COALESCE(NEW.season, OLD.season);
    
    IF existing_entry IS NOT NULL THEN
        -- Update existing entry
        UPDATE public.season_leaderboard 
        SET 
            total_picks = user_record.total_picks,
            total_wins = user_record.total_wins,
            total_losses = user_record.total_losses,
            total_pushes = user_record.total_pushes,
            lock_wins = user_record.lock_wins,
            lock_losses = user_record.lock_losses,
            total_points = user_record.total_points,
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry (preserve existing payment status if available)
        INSERT INTO public.season_leaderboard (
            user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
            lock_wins, lock_losses, total_points, payment_status, is_verified
        ) VALUES (
            COALESCE(NEW.user_id, OLD.user_id),
            (SELECT display_name FROM public.users WHERE id = COALESCE(NEW.user_id, OLD.user_id)),
            COALESCE(NEW.season, OLD.season),
            user_record.total_picks,
            user_record.total_wins,
            user_record.total_losses,
            user_record.total_pushes,
            user_record.lock_wins,
            user_record.lock_losses,
            user_record.total_points,
            -- Get payment status from leaguesafe_payments if available
            COALESCE((
                SELECT CASE 
                    WHEN status = 'Paid' THEN 'Paid'
                    WHEN status = 'Pending' THEN 'Pending' 
                    ELSE 'NotPaid'
                END FROM public.leaguesafe_payments 
                WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) 
                    AND season = COALESCE(NEW.season, OLD.season)
            ), 'NotPaid'),
            -- Get verified status from leaguesafe_payments if available
            COALESCE((
                SELECT (status = 'Paid' AND is_matched = TRUE) 
                FROM public.leaguesafe_payments 
                WHERE user_id = COALESCE(NEW.user_id, OLD.user_id) 
                    AND season = COALESCE(NEW.season, OLD.season)
            ), FALSE)
        );
    END IF;
    
    -- Recalculate rankings for this season
    UPDATE public.season_leaderboard 
    SET season_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.season_leaderboard
        WHERE season = COALESCE(NEW.season, OLD.season)
    ) subq
    WHERE public.season_leaderboard.id = subq.id
        AND public.season_leaderboard.season = COALESCE(NEW.season, OLD.season);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Step 4: Update the anonymous picks helper functions to use games table
CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard_for_user(
    p_user_id UUID, 
    p_week INTEGER, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_stats RECORD;
BEGIN
    -- Calculate combined stats from regular picks and assigned anonymous picks
    -- Use games table as single source of truth
    SELECT 
        COUNT(*) as picks_made,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_stats
    FROM (
        -- Regular picks
        SELECT calc.result, p.is_lock, calc.points_earned
        FROM public.picks p
        JOIN public.games g ON p.game_id = g.id
        CROSS JOIN LATERAL public.calculate_pick_from_game(
            p.selected_team, p.is_lock, g.winner_against_spread, g.base_points, g.margin_bonus
        ) calc
        WHERE p.user_id = p_user_id AND p.week = p_week AND p.season = p_season
        
        UNION ALL
        
        -- Assigned anonymous picks
        SELECT calc.result, ap.is_lock, calc.points_earned
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
        CROSS JOIN LATERAL public.calculate_pick_from_game(
            ap.selected_team, ap.is_lock, g.winner_against_spread, g.base_points, g.margin_bonus
        ) calc
        WHERE ap.assigned_user_id = p_user_id AND ap.week = p_week AND ap.season = p_season
    ) combined_picks;
    
    -- Upsert the weekly leaderboard entry
    INSERT INTO public.weekly_leaderboard (
        user_id, display_name, week, season, picks_made, wins, losses, pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified
    ) VALUES (
        p_user_id,
        (SELECT display_name FROM public.users WHERE id = p_user_id),
        p_week,
        p_season,
        user_stats.picks_made,
        user_stats.wins,
        user_stats.losses,
        user_stats.pushes,
        user_stats.lock_wins,
        user_stats.lock_losses,
        user_stats.total_points,
        COALESCE((SELECT CASE WHEN status = 'Paid' THEN 'Paid' WHEN status = 'Pending' THEN 'Pending' ELSE 'NotPaid' END FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), 'NotPaid'),
        COALESCE((SELECT (status = 'Paid' AND is_matched = TRUE) FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), FALSE)
    )
    ON CONFLICT (user_id, week, season) 
    DO UPDATE SET
        picks_made = EXCLUDED.picks_made,
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        pushes = EXCLUDED.pushes,
        lock_wins = EXCLUDED.lock_wins,
        lock_losses = EXCLUDED.lock_losses,
        total_points = EXCLUDED.total_points,
        updated_at = NOW();
    
    -- Recalculate rankings for this week/season
    UPDATE public.weekly_leaderboard 
    SET weekly_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.weekly_leaderboard
        WHERE week = p_week AND season = p_season
    ) subq
    WHERE public.weekly_leaderboard.id = subq.id
        AND public.weekly_leaderboard.week = p_week
        AND public.weekly_leaderboard.season = p_season;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Update season leaderboard helper to use games table  
CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard_for_user(
    p_user_id UUID, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_stats RECORD;
BEGIN
    -- Calculate combined season stats from regular picks and assigned anonymous picks
    -- Use games table as single source of truth
    SELECT 
        COUNT(*) as total_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_stats
    FROM (
        -- Regular picks
        SELECT calc.result, p.is_lock, calc.points_earned
        FROM public.picks p
        JOIN public.games g ON p.game_id = g.id
        CROSS JOIN LATERAL public.calculate_pick_from_game(
            p.selected_team, p.is_lock, g.winner_against_spread, g.base_points, g.margin_bonus
        ) calc
        WHERE p.user_id = p_user_id AND p.season = p_season
        
        UNION ALL
        
        -- Assigned anonymous picks
        SELECT calc.result, ap.is_lock, calc.points_earned
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
        CROSS JOIN LATERAL public.calculate_pick_from_game(
            ap.selected_team, ap.is_lock, g.winner_against_spread, g.base_points, g.margin_bonus
        ) calc
        WHERE ap.assigned_user_id = p_user_id AND ap.season = p_season
    ) combined_picks;
    
    -- Upsert the season leaderboard entry
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified
    ) VALUES (
        p_user_id,
        (SELECT display_name FROM public.users WHERE id = p_user_id),
        p_season,
        user_stats.total_picks,
        user_stats.total_wins,
        user_stats.total_losses,
        user_stats.total_pushes,
        user_stats.lock_wins,
        user_stats.lock_losses,
        user_stats.total_points,
        COALESCE((SELECT CASE WHEN status = 'Paid' THEN 'Paid' WHEN status = 'Pending' THEN 'Pending' ELSE 'NotPaid' END FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), 'NotPaid'),
        COALESCE((SELECT (status = 'Paid' AND is_matched = TRUE) FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), FALSE)
    )
    ON CONFLICT (user_id, season) 
    DO UPDATE SET
        total_picks = EXCLUDED.total_picks,
        total_wins = EXCLUDED.total_wins,
        total_losses = EXCLUDED.total_losses,
        total_pushes = EXCLUDED.total_pushes,
        lock_wins = EXCLUDED.lock_wins,
        lock_losses = EXCLUDED.lock_losses,
        total_points = EXCLUDED.total_points,
        updated_at = NOW();
    
    -- Recalculate rankings for this season
    UPDATE public.season_leaderboard 
    SET season_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.season_leaderboard
        WHERE season = p_season
    ) subq
    WHERE public.season_leaderboard.id = subq.id
        AND public.season_leaderboard.season = p_season;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Fix Nebraska game - first update the games table correctly
-- Nebraska was favored by 6.5, only won by 3, so Cincinnati should be ATS winner
UPDATE games 
SET 
    winner_against_spread = 'CINCINNATI',
    status = 'completed',
    -- Cincinnati cover margin = 6.5 - 3 = 3.5 (no bonus points)
    margin_bonus = 0
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 7: Now update picks using the simplified calculation
-- Temporarily disable triggers to prevent multiple recalculations
ALTER TABLE picks DISABLE TRIGGER update_weekly_leaderboard_trigger;
ALTER TABLE picks DISABLE TRIGGER update_season_leaderboard_trigger;

-- Update all picks for Nebraska game using games table as source of truth
UPDATE picks 
SET 
    result = calc.result,
    points_earned = calc.points_earned,
    updated_at = NOW()
FROM public.games g
CROSS JOIN LATERAL public.calculate_pick_from_game(
    picks.selected_team, 
    picks.is_lock, 
    g.winner_against_spread, 
    g.base_points, 
    g.margin_bonus
) calc
WHERE picks.game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND g.id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Re-enable triggers
ALTER TABLE picks ENABLE TRIGGER update_weekly_leaderboard_trigger;
ALTER TABLE picks ENABLE TRIGGER update_season_leaderboard_trigger;

-- Step 8: Force trigger recalculation for all affected users
DO $$
DECLARE
    affected_user RECORD;
BEGIN
    -- Get all users who had picks in the Nebraska game
    FOR affected_user IN 
        SELECT DISTINCT user_id, week, season 
        FROM picks 
        WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
    LOOP
        -- Trigger recalculation by updating one pick per user
        UPDATE picks 
        SET updated_at = NOW() 
        WHERE user_id = affected_user.user_id 
          AND week = affected_user.week 
          AND season = affected_user.season
          AND game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
        LIMIT 1;
    END LOOP;
END;
$$;

-- Step 9: Verification queries
SELECT 
  'Nebraska vs Cincinnati - Simplified Fix Results' as description,
  away_team || ' @ ' || home_team as matchup,
  away_score || ' - ' || home_score as final_score,
  'Nebraska -' || ABS(spread) as betting_line,
  winner_against_spread as ats_winner,
  base_points,
  margin_bonus,
  status,
  CASE 
    WHEN winner_against_spread = 'CINCINNATI' THEN '✅ Cincinnati correctly set as ATS winner'
    ELSE '❌ ATS winner still incorrect'
  END as fix_status
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Show updated pick results using games table calculation
SELECT 
  p.selected_team,
  COUNT(*) as pick_count,
  p.result,
  p.points_earned,
  calc.points_earned as calculated_points,
  CASE 
    WHEN p.selected_team = 'CINCINNATI' AND p.result = 'win' THEN '✅ Correct - Cincinnati covered'
    WHEN p.selected_team = 'NEBRASKA' AND p.result = 'loss' THEN '✅ Correct - Nebraska failed to cover'
    ELSE '❌ Still incorrect'
  END as validation
FROM picks p
JOIN games g ON p.game_id = g.id
CROSS JOIN LATERAL public.calculate_pick_from_game(
    p.selected_team, p.is_lock, g.winner_against_spread, g.base_points, g.margin_bonus
) calc
WHERE p.game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY p.selected_team, p.result, p.points_earned, calc.points_earned
ORDER BY p.selected_team, p.result;