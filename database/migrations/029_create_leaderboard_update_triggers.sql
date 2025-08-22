-- Migration: Create trigger functions and triggers for real-time leaderboard updates

-- ===================================================================
-- TRIGGER FUNCTION 1: Update payment status in leaderboard tables
-- Triggered when leaguesafe_payments table is modified
-- ===================================================================

CREATE OR REPLACE FUNCTION public.update_leaderboard_payment_status()
RETURNS TRIGGER AS $$
DECLARE
    verified_status BOOLEAN;
    payment_status_text TEXT;
BEGIN
    -- Determine if user is verified (paid and matched)
    IF (COALESCE(NEW.status, 'NotPaid') = 'Paid' AND COALESCE(NEW.is_matched, FALSE) = TRUE) THEN
        verified_status := TRUE;
        payment_status_text := NEW.status;
    ELSE
        verified_status := FALSE;
        payment_status_text := COALESCE(NEW.status, 'NotPaid');
    END IF;
    
    -- Update weekly leaderboard entries for this user and season
    UPDATE public.weekly_leaderboard 
    SET 
        payment_status = payment_status_text,
        is_verified = verified_status,
        updated_at = NOW()
    WHERE user_id = NEW.user_id AND season = NEW.season;
    
    -- Update season leaderboard entries for this user and season
    UPDATE public.season_leaderboard 
    SET 
        payment_status = payment_status_text,
        is_verified = verified_status,
        updated_at = NOW()
    WHERE user_id = NEW.user_id AND season = NEW.season;
    
    -- Log the update for debugging
    RAISE NOTICE 'Updated payment status for user % in season % to: % (verified: %)', 
        NEW.user_id, NEW.season, payment_status_text, verified_status;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===================================================================
-- TRIGGER FUNCTION 2: Recalculate weekly leaderboard when picks change
-- Triggered when picks table is modified
-- ===================================================================

CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard()
RETURNS TRIGGER AS $$
DECLARE
    user_record RECORD;
    existing_entry RECORD;
    new_rank INTEGER;
BEGIN
    -- Get the user's display name
    SELECT display_name INTO user_record 
    FROM public.users 
    WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    
    IF user_record IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate new weekly stats for the affected user/week/season
    SELECT 
        COUNT(p.id) as picks_made,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points
    INTO user_record
    FROM public.picks p 
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
                SELECT status FROM public.leaguesafe_payments 
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

-- ===================================================================
-- TRIGGER FUNCTION 3: Recalculate season leaderboard when picks change
-- Triggered when picks table is modified
-- ===================================================================

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
    SELECT 
        COUNT(p.id) as total_picks,
        COUNT(CASE WHEN p.result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN p.result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(p.points_earned), 0) as total_points
    INTO user_record
    FROM public.picks p 
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
            user_record.display_name,
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
                SELECT status FROM public.leaguesafe_payments 
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

-- ===================================================================
-- TRIGGER FUNCTION 4: Handle anonymous pick assignment to leaderboards
-- Triggered when anonymous_picks.assigned_user_id is set
-- ===================================================================

CREATE OR REPLACE FUNCTION public.handle_anonymous_pick_assignment()
RETURNS TRIGGER AS $$
DECLARE
    pick_record RECORD;
BEGIN
    -- Only process if assigned_user_id was changed (null to not-null or different user)
    IF (OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id) AND NEW.assigned_user_id IS NOT NULL THEN
        
        -- Create a temporary pick record that matches the picks table structure
        SELECT 
            NEW.assigned_user_id as user_id,
            NEW.game_id,
            NEW.week,
            NEW.season,
            NEW.selected_team,
            NEW.is_lock,
            -- Try to get result and points from games table if game is completed
            CASE 
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN (g.home_score + g.spread) = g.away_score THEN 'push'::pick_result
                        WHEN (NEW.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                             (NEW.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score) THEN 'win'::pick_result
                        ELSE 'loss'::pick_result
                    END
                ELSE NULL::pick_result
            END as result,
            -- Calculate points based on result and margin (simplified version)
            CASE 
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN (g.home_score + g.spread) = g.away_score THEN 10 -- push
                        WHEN (NEW.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                             (NEW.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score) THEN 
                            CASE WHEN NEW.is_lock THEN 40 ELSE 20 END -- win (simplified, no margin bonus)
                        ELSE 0 -- loss
                    END
                ELSE NULL::INTEGER
            END as points_earned
        INTO pick_record
        FROM public.games g 
        WHERE g.id = NEW.game_id;
        
        -- Trigger the leaderboard recalculation functions by simulating a pick insert
        -- This reuses our existing trigger functions
        PERFORM public.recalculate_weekly_leaderboard_for_user(
            pick_record.user_id, 
            pick_record.week, 
            pick_record.season
        );
        
        PERFORM public.recalculate_season_leaderboard_for_user(
            pick_record.user_id, 
            pick_record.season
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===================================================================
-- HELPER FUNCTIONS for manual leaderboard recalculation
-- ===================================================================

CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard_for_user(
    p_user_id UUID, 
    p_week INTEGER, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_stats RECORD;
    existing_entry RECORD;
BEGIN
    -- Get user display name
    SELECT display_name INTO user_stats 
    FROM public.users 
    WHERE id = p_user_id;
    
    IF user_stats IS NULL THEN
        RETURN;
    END IF;
    
    -- Calculate combined stats from regular picks and assigned anonymous picks
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
        SELECT result, is_lock, points_earned
        FROM public.picks 
        WHERE user_id = p_user_id AND week = p_week AND season = p_season
        
        UNION ALL
        
        -- Assigned anonymous picks (with calculated results)
        SELECT 
            CASE 
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN (g.home_score + g.spread) = g.away_score THEN 'push'::pick_result
                        WHEN (ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score) THEN 'win'::pick_result
                        ELSE 'loss'::pick_result
                    END
                ELSE NULL::pick_result
            END as result,
            ap.is_lock,
            CASE 
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN (g.home_score + g.spread) = g.away_score THEN 10
                        WHEN (ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score) THEN 
                            CASE WHEN ap.is_lock THEN 40 ELSE 20 END
                        ELSE 0
                    END
                ELSE NULL::INTEGER
            END as points_earned
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
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
        COALESCE((SELECT status FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), 'NotPaid'),
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

CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard_for_user(
    p_user_id UUID, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_stats RECORD;
BEGIN
    -- Calculate combined season stats from regular picks and assigned anonymous picks
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
        SELECT result, is_lock, points_earned
        FROM public.picks 
        WHERE user_id = p_user_id AND season = p_season
        
        UNION ALL
        
        -- Assigned anonymous picks (with calculated results)
        SELECT 
            CASE 
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN (g.home_score + g.spread) = g.away_score THEN 'push'::pick_result
                        WHEN (ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score) THEN 'win'::pick_result
                        ELSE 'loss'::pick_result
                    END
                ELSE NULL::pick_result
            END as result,
            ap.is_lock,
            CASE 
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN (g.home_score + g.spread) = g.away_score THEN 10
                        WHEN (ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score) THEN 
                            CASE WHEN ap.is_lock THEN 40 ELSE 20 END
                        ELSE 0
                    END
                ELSE NULL::INTEGER
            END as points_earned
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
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
        COALESCE((SELECT status FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), 'NotPaid'),
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