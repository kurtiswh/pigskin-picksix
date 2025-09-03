-- Migration 121: Add Admin Leaderboard Visibility Controls
-- 
-- PURPOSE: Allow admin to control which picks (authenticated and anonymous) appear on leaderboard
-- - Add show_on_leaderboard flag to picks table  
-- - Update leaderboard functions to respect visibility flags
-- - Only show payment indicators for unpaid users

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 121: Add admin leaderboard visibility controls';
    RAISE NOTICE '===============================================================';
END;
$$;

-- Step 1: Add show_on_leaderboard column to picks table
ALTER TABLE public.picks 
ADD COLUMN IF NOT EXISTS show_on_leaderboard BOOLEAN DEFAULT TRUE;

-- Step 2: Add index for performance
CREATE INDEX IF NOT EXISTS idx_picks_show_on_leaderboard 
ON public.picks(show_on_leaderboard);

-- Step 3: Drop and recreate season leaderboard recalculation to respect visibility flags
DROP FUNCTION IF EXISTS public.recalculate_season_leaderboard_for_user(UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard_for_user(
    target_user_id UUID,
    target_season INTEGER
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_info RECORD;
    auth_stats RECORD;
    anon_stats RECORD;
    combined_stats RECORD;
    final_pick_source VARCHAR(20);
BEGIN
    -- Get user info and payment status
    SELECT 
        u.display_name,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified
    INTO user_info
    FROM public.users u
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = target_season
    WHERE u.id = target_user_id;
    
    IF user_info IS NULL THEN
        RAISE WARNING 'User % not found', target_user_id;
        RETURN;
    END IF;
    
    -- Calculate stats from authenticated picks that should show on leaderboard
    SELECT 
        COUNT(p.id) as total_picks,
        COUNT(CASE WHEN calc.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN calc.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN calc.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN calc.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN calc.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(calc.points_earned), 0) as total_points
    INTO auth_stats
    FROM public.picks p 
    JOIN public.games g ON p.game_id = g.id
    CROSS JOIN LATERAL public.calculate_pick_from_game(
        p.selected_team, 
        p.is_lock, 
        g.winner_against_spread, 
        g.base_points, 
        g.margin_bonus
    ) calc
    WHERE p.user_id = target_user_id 
        AND p.season = target_season
        AND p.submitted_at IS NOT NULL
        AND p.show_on_leaderboard = TRUE;  -- Admin visibility control
    
    -- Calculate stats from anonymous picks that should show on leaderboard
    SELECT 
        COUNT(ap.id) as anon_picks,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as anon_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ABS((g.home_score + g.spread) - g.away_score) < 0.5
            THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as anon_losses,
        COUNT(CASE WHEN 
            g.status = 'completed' AND ap.is_lock = true AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND ap.is_lock = true AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(ap.points_earned), 0) as anon_points
    INTO anon_stats
    FROM public.anonymous_picks ap
    LEFT JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = TRUE  -- Admin visibility control
        AND ap.validation_status IN ('auto_validated', 'manually_validated');
    
    -- Determine pick source
    final_pick_source := CASE 
        WHEN COALESCE(auth_stats.total_picks, 0) > 0 AND COALESCE(anon_stats.anon_picks, 0) > 0 THEN 'mixed'
        WHEN COALESCE(anon_stats.anon_picks, 0) > 0 THEN 'anonymous'
        ELSE 'authenticated'
    END;
    
    -- Combine stats
    combined_stats := ROW(
        COALESCE(auth_stats.total_picks, 0) + COALESCE(anon_stats.anon_picks, 0),
        COALESCE(auth_stats.wins, 0) + COALESCE(anon_stats.anon_wins, 0),
        COALESCE(auth_stats.losses, 0) + COALESCE(anon_stats.anon_losses, 0),
        COALESCE(auth_stats.pushes, 0) + COALESCE(anon_stats.anon_pushes, 0),
        COALESCE(auth_stats.lock_wins, 0) + COALESCE(anon_stats.anon_lock_wins, 0),
        COALESCE(auth_stats.lock_losses, 0) + COALESCE(anon_stats.anon_lock_losses, 0),
        COALESCE(auth_stats.total_points, 0) + COALESCE(anon_stats.anon_points, 0)
    );
    
    -- Only update/insert if user has any picks that should show on leaderboard
    IF combined_stats.f1 > 0 THEN
        -- Insert or update season leaderboard
        INSERT INTO public.season_leaderboard (
            user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
            lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
        ) VALUES (
            target_user_id, user_info.display_name, target_season, 
            combined_stats.f1, combined_stats.f2, combined_stats.f3, combined_stats.f4,
            combined_stats.f5, combined_stats.f6, combined_stats.f7,
            user_info.payment_status, user_info.is_verified, final_pick_source
        )
        ON CONFLICT (user_id, season)
        DO UPDATE SET
            display_name = EXCLUDED.display_name,
            total_picks = EXCLUDED.total_picks,
            total_wins = EXCLUDED.total_wins,
            total_losses = EXCLUDED.total_losses,
            total_pushes = EXCLUDED.total_pushes,
            lock_wins = EXCLUDED.lock_wins,
            lock_losses = EXCLUDED.lock_losses,
            total_points = EXCLUDED.total_points,
            payment_status = EXCLUDED.payment_status,
            is_verified = EXCLUDED.is_verified,
            pick_source = EXCLUDED.pick_source,
            updated_at = CURRENT_TIMESTAMP;
    ELSE
        -- Remove from leaderboard if no picks should show
        DELETE FROM public.season_leaderboard 
        WHERE user_id = target_user_id AND season = target_season;
    END IF;
END;
$$;

-- Step 4: Drop and recreate weekly leaderboard recalculation to respect visibility flags
DROP FUNCTION IF EXISTS public.recalculate_weekly_leaderboard_for_user(UUID, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard_for_user(
    target_user_id UUID,
    target_week INTEGER,
    target_season INTEGER
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_info RECORD;
    auth_stats RECORD;
    anon_stats RECORD;
    combined_stats RECORD;
    final_pick_source VARCHAR(20);
BEGIN
    -- Get user info and payment status
    SELECT 
        u.display_name,
        CASE 
            WHEN lsp.status = 'Paid' THEN 'Paid'
            WHEN lsp.status = 'Pending' THEN 'Pending'
            ELSE 'NotPaid'
        END as payment_status,
        (lsp.status = 'Paid' AND lsp.is_matched = true) as is_verified
    INTO user_info
    FROM public.users u
    LEFT JOIN public.leaguesafe_payments lsp ON u.id = lsp.user_id AND lsp.season = target_season
    WHERE u.id = target_user_id;
    
    IF user_info IS NULL THEN
        RAISE WARNING 'User % not found', target_user_id;
        RETURN;
    END IF;
    
    -- Calculate stats from authenticated picks that should show on leaderboard
    SELECT 
        COUNT(p.id) as picks_made,
        COUNT(CASE WHEN calc.result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN calc.result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN calc.result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN calc.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN calc.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(calc.points_earned), 0) as total_points
    INTO auth_stats
    FROM public.picks p 
    JOIN public.games g ON p.game_id = g.id
    CROSS JOIN LATERAL public.calculate_pick_from_game(
        p.selected_team, 
        p.is_lock, 
        g.winner_against_spread, 
        g.base_points, 
        g.margin_bonus
    ) calc
    WHERE p.user_id = target_user_id 
        AND p.week = target_week
        AND p.season = target_season
        AND p.submitted_at IS NOT NULL
        AND p.show_on_leaderboard = TRUE;  -- Admin visibility control
    
    -- Calculate stats from anonymous picks that should show on leaderboard
    SELECT 
        COUNT(ap.id) as anon_picks,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as anon_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ABS((g.home_score + g.spread) - g.away_score) < 0.5
            THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as anon_losses,
        COUNT(CASE WHEN 
            g.status = 'completed' AND ap.is_lock = true AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND ap.is_lock = true AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(ap.points_earned), 0) as anon_points
    INTO anon_stats
    FROM public.anonymous_picks ap
    LEFT JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.week = target_week
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = TRUE  -- Admin visibility control
        AND ap.validation_status IN ('auto_validated', 'manually_validated');
    
    -- Determine pick source
    final_pick_source := CASE 
        WHEN COALESCE(auth_stats.picks_made, 0) > 0 AND COALESCE(anon_stats.anon_picks, 0) > 0 THEN 'mixed'
        WHEN COALESCE(anon_stats.anon_picks, 0) > 0 THEN 'anonymous'
        ELSE 'authenticated'
    END;
    
    -- Combine stats
    combined_stats := ROW(
        COALESCE(auth_stats.picks_made, 0) + COALESCE(anon_stats.anon_picks, 0),
        COALESCE(auth_stats.wins, 0) + COALESCE(anon_stats.anon_wins, 0),
        COALESCE(auth_stats.losses, 0) + COALESCE(anon_stats.anon_losses, 0),
        COALESCE(auth_stats.pushes, 0) + COALESCE(anon_stats.anon_pushes, 0),
        COALESCE(auth_stats.lock_wins, 0) + COALESCE(anon_stats.anon_lock_wins, 0),
        COALESCE(auth_stats.lock_losses, 0) + COALESCE(anon_stats.anon_lock_losses, 0),
        COALESCE(auth_stats.total_points, 0) + COALESCE(anon_stats.anon_points, 0)
    );
    
    -- Only update/insert if user has any picks that should show on leaderboard
    IF combined_stats.f1 > 0 THEN
        -- Insert or update weekly leaderboard
        INSERT INTO public.weekly_leaderboard (
            user_id, display_name, week, season, picks_made, wins, losses, pushes,
            lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
        ) VALUES (
            target_user_id, user_info.display_name, target_week, target_season,
            combined_stats.f1, combined_stats.f2, combined_stats.f3, combined_stats.f4,
            combined_stats.f5, combined_stats.f6, combined_stats.f7,
            user_info.payment_status, user_info.is_verified, final_pick_source
        )
        ON CONFLICT (user_id, week, season)
        DO UPDATE SET
            display_name = EXCLUDED.display_name,
            picks_made = EXCLUDED.picks_made,
            wins = EXCLUDED.wins,
            losses = EXCLUDED.losses,
            pushes = EXCLUDED.pushes,
            lock_wins = EXCLUDED.lock_wins,
            lock_losses = EXCLUDED.lock_losses,
            total_points = EXCLUDED.total_points,
            payment_status = EXCLUDED.payment_status,
            is_verified = EXCLUDED.is_verified,
            pick_source = EXCLUDED.pick_source,
            updated_at = CURRENT_TIMESTAMP;
    ELSE
        -- Remove from leaderboard if no picks should show
        DELETE FROM public.weekly_leaderboard 
        WHERE user_id = target_user_id AND week = target_week AND season = target_season;
    END IF;
END;
$$;

-- Step 5: Create admin function to toggle leaderboard visibility for authenticated picks
CREATE OR REPLACE FUNCTION public.toggle_picks_leaderboard_visibility(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER DEFAULT NULL,  -- If NULL, affects all weeks for the season
    show_on_leaderboard BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    affected_picks INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    picks_updated INTEGER;
BEGIN
    -- Only admins can call this function
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;
    
    -- Update picks visibility
    IF target_week IS NULL THEN
        -- Update all weeks for the season
        UPDATE public.picks 
        SET show_on_leaderboard = toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season;
    ELSE
        -- Update specific week
        UPDATE public.picks 
        SET show_on_leaderboard = toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
    END IF;
    
    GET DIAGNOSTICS picks_updated = ROW_COUNT;
    
    -- Recalculate affected leaderboards
    IF target_week IS NULL THEN
        -- Recalculate season leaderboard
        PERFORM public.recalculate_season_leaderboard_for_user(target_user_id, target_season);
        
        -- Recalculate all weekly leaderboards for this user/season
        PERFORM public.recalculate_weekly_leaderboard_for_user(target_user_id, w.week, target_season)
        FROM (SELECT DISTINCT week FROM public.picks WHERE user_id = target_user_id AND season = target_season) w;
    ELSE
        -- Recalculate specific week and season
        PERFORM public.recalculate_weekly_leaderboard_for_user(target_user_id, target_week, target_season);
        PERFORM public.recalculate_season_leaderboard_for_user(target_user_id, target_season);
    END IF;
    
    RETURN QUERY SELECT picks_updated, 
        format('Updated %s picks visibility to %s', picks_updated, show_on_leaderboard);
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT 0, format('Error: %s', SQLERRM);
END;
$$;

-- Step 6: Create admin function to toggle anonymous picks visibility
CREATE OR REPLACE FUNCTION public.toggle_anonymous_picks_leaderboard_visibility(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER DEFAULT NULL,
    target_email TEXT DEFAULT NULL,  -- If specified, only affects picks from this email
    show_on_leaderboard BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    affected_picks INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    picks_updated INTEGER;
BEGIN
    -- Only admins can call this function
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = TRUE) THEN
        RAISE EXCEPTION 'Access denied: Admin privileges required';
    END IF;
    
    -- Update anonymous picks visibility
    IF target_week IS NULL AND target_email IS NULL THEN
        -- Update all anonymous picks for user/season
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = toggle_anonymous_picks_leaderboard_visibility.show_on_leaderboard
        WHERE assigned_user_id = target_user_id 
        AND season = target_season;
    ELSIF target_week IS NOT NULL AND target_email IS NULL THEN
        -- Update specific week, all emails
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = toggle_anonymous_picks_leaderboard_visibility.show_on_leaderboard
        WHERE assigned_user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
    ELSIF target_week IS NULL AND target_email IS NOT NULL THEN
        -- Update specific email, all weeks
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = toggle_anonymous_picks_leaderboard_visibility.show_on_leaderboard
        WHERE assigned_user_id = target_user_id 
        AND season = target_season 
        AND email = target_email;
    ELSE
        -- Update specific week and email
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = toggle_anonymous_picks_leaderboard_visibility.show_on_leaderboard
        WHERE assigned_user_id = target_user_id 
        AND season = target_season 
        AND week = target_week
        AND email = target_email;
    END IF;
    
    GET DIAGNOSTICS picks_updated = ROW_COUNT;
    
    -- Recalculate affected leaderboards
    IF target_week IS NULL THEN
        -- Recalculate season leaderboard
        PERFORM public.recalculate_season_leaderboard_for_user(target_user_id, target_season);
        
        -- Recalculate all weekly leaderboards for this user/season
        PERFORM public.recalculate_weekly_leaderboard_for_user(target_user_id, w.week, target_season)
        FROM (SELECT DISTINCT week FROM public.anonymous_picks WHERE assigned_user_id = target_user_id AND season = target_season) w;
    ELSE
        -- Recalculate specific week and season
        PERFORM public.recalculate_weekly_leaderboard_for_user(target_user_id, target_week, target_season);
        PERFORM public.recalculate_season_leaderboard_for_user(target_user_id, target_season);
    END IF;
    
    RETURN QUERY SELECT picks_updated, 
        format('Updated %s anonymous picks visibility to %s', picks_updated, show_on_leaderboard);
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN QUERY SELECT 0, format('Error: %s', SQLERRM);
END;
$$;

-- Add comments
COMMENT ON COLUMN public.picks.show_on_leaderboard IS 
'Admin control: whether these picks should appear on leaderboard calculations';

COMMENT ON FUNCTION public.toggle_picks_leaderboard_visibility IS 
'Admin function: toggle visibility of authenticated picks on leaderboard';

COMMENT ON FUNCTION public.toggle_anonymous_picks_leaderboard_visibility IS 
'Admin function: toggle visibility of anonymous picks on leaderboard';

-- Notify about the new controls
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 121 complete!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 New admin controls:';
    RAISE NOTICE '   - picks.show_on_leaderboard column added (defaults to TRUE)';
    RAISE NOTICE '   - anonymous_picks.show_on_leaderboard already exists';
    RAISE NOTICE '';
    RAISE NOTICE '📋 Admin functions:';
    RAISE NOTICE '   - toggle_picks_leaderboard_visibility(user_id, season, week?, show?)';
    RAISE NOTICE '   - toggle_anonymous_picks_leaderboard_visibility(user_id, season, week?, email?, show?)';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Leaderboard now respects admin visibility controls for both pick types';
    RAISE NOTICE '';
END;
$$;