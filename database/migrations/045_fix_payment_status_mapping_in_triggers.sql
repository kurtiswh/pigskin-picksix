-- Migration: Fix payment status mapping in leaderboard trigger functions
-- Resolves constraint violation error when users with "Unknown" payment status try to submit picks

-- ===================================================================
-- PROBLEM:
-- The recalculate_season_leaderboard() and recalculate_weekly_leaderboard() functions
-- pull payment status directly from leaguesafe_payments.status without mapping
-- to allowed values, causing CHECK constraint violations when status is "Unknown"
-- ===================================================================

-- Step 1: Fix the season leaderboard trigger function
CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard()
RETURNS TRIGGER AS $$
DECLARE
    user_record RECORD;
    existing_entry RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
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
    
    -- Map payment status to allowed values with proper constraint handling
    SELECT 
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'  -- Handles 'Unknown', NULL, and any other values
        END as payment_status,
        CASE 
            WHEN lsp.status = 'Paid' AND COALESCE(lsp.is_matched, FALSE) = TRUE THEN TRUE
            ELSE FALSE
        END as is_verified
    INTO mapped_payment_status, mapped_is_verified
    FROM public.leaguesafe_payments lsp 
    WHERE lsp.user_id = COALESCE(NEW.user_id, OLD.user_id) 
        AND lsp.season = COALESCE(NEW.season, OLD.season);
    
    -- If no payment record found, set defaults
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
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
            payment_status = mapped_payment_status,
            is_verified = mapped_is_verified,
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry with properly mapped payment status
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
            mapped_payment_status,  -- Use mapped value instead of raw status
            mapped_is_verified      -- Use mapped value instead of raw status
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

-- Step 2: Fix the weekly leaderboard trigger function
CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard()
RETURNS TRIGGER AS $$
DECLARE
    user_record RECORD;
    existing_entry RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
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
    
    -- Map payment status to allowed values with proper constraint handling
    SELECT 
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'  -- Handles 'Unknown', NULL, and any other values
        END as payment_status,
        CASE 
            WHEN lsp.status = 'Paid' AND COALESCE(lsp.is_matched, FALSE) = TRUE THEN TRUE
            ELSE FALSE
        END as is_verified
    INTO mapped_payment_status, mapped_is_verified
    FROM public.leaguesafe_payments lsp 
    WHERE lsp.user_id = COALESCE(NEW.user_id, OLD.user_id) 
        AND lsp.season = COALESCE(NEW.season, OLD.season);
    
    -- If no payment record found, set defaults
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
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
            payment_status = mapped_payment_status,
            is_verified = mapped_is_verified,
            updated_at = NOW()
        WHERE id = existing_entry.id;
    ELSE
        -- Insert new entry with properly mapped payment status
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
            mapped_payment_status,  -- Use mapped value instead of raw status
            mapped_is_verified      -- Use mapped value instead of raw status
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

-- Step 3: Update helper functions to use the same mapping logic
CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard_for_user(
    p_user_id UUID, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_stats RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
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
    
    -- Map payment status to allowed values
    SELECT 
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        CASE 
            WHEN lsp.status = 'Paid' AND COALESCE(lsp.is_matched, FALSE) = TRUE THEN TRUE
            ELSE FALSE
        END as is_verified
    INTO mapped_payment_status, mapped_is_verified
    FROM public.leaguesafe_payments lsp 
    WHERE lsp.user_id = p_user_id AND lsp.season = p_season;
    
    -- If no payment record found, set defaults
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
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
        mapped_payment_status,
        mapped_is_verified
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
        payment_status = EXCLUDED.payment_status,
        is_verified = EXCLUDED.is_verified,
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

-- Step 4: Update weekly helper function too
CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard_for_user(
    p_user_id UUID, 
    p_week INTEGER, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_stats RECORD;
    existing_entry RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
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
    
    -- Map payment status to allowed values
    SELECT 
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        CASE 
            WHEN lsp.status = 'Paid' AND COALESCE(lsp.is_matched, FALSE) = TRUE THEN TRUE
            ELSE FALSE
        END as is_verified
    INTO mapped_payment_status, mapped_is_verified
    FROM public.leaguesafe_payments lsp 
    WHERE lsp.user_id = p_user_id AND lsp.season = p_season;
    
    -- If no payment record found, set defaults
    IF mapped_payment_status IS NULL THEN
        mapped_payment_status := 'NotPaid';
        mapped_is_verified := FALSE;
    END IF;
    
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
        mapped_payment_status,
        mapped_is_verified
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
        payment_status = EXCLUDED.payment_status,
        is_verified = EXCLUDED.is_verified,
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

-- Step 5: Clean up existing data with invalid payment statuses
UPDATE public.season_leaderboard 
SET 
    payment_status = 'NotPaid',
    is_verified = FALSE,
    updated_at = NOW()
WHERE payment_status NOT IN ('Paid', 'NotPaid', 'Pending');

UPDATE public.weekly_leaderboard 
SET 
    payment_status = 'NotPaid',
    is_verified = FALSE,
    updated_at = NOW()
WHERE payment_status NOT IN ('Paid', 'NotPaid', 'Pending');

-- Step 6: Add comments for documentation
COMMENT ON FUNCTION public.recalculate_season_leaderboard() IS 'Fixed to properly map payment status values and prevent CHECK constraint violations';
COMMENT ON FUNCTION public.recalculate_weekly_leaderboard() IS 'Fixed to properly map payment status values and prevent CHECK constraint violations';

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 045: Successfully fixed payment status mapping in leaderboard trigger functions';
    RAISE NOTICE 'Users with "Unknown" payment status can now submit picks without constraint violations';
END $$;