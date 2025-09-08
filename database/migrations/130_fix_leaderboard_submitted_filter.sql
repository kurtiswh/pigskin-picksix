-- Migration 130: Fix Leaderboard to Only Count Submitted Picks
-- 
-- PURPOSE: Ensure that only picks with submitted=true are counted in leaderboard calculations
-- Previously was checking submitted_at IS NOT NULL which could include unsubmitted picks
-- This migration updates all leaderboard functions to properly check the submitted flag

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 130: Fix leaderboard to only count submitted picks';
    RAISE NOTICE '===============================================================';
END;
$$;

-- Step 1: Update the season leaderboard recalculation function
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
    
    -- Calculate stats from authenticated picks that are SUBMITTED and should show on leaderboard
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
        AND p.submitted = TRUE  -- Check submitted flag instead of submitted_at
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
            g.status = 'completed' AND
            ap.is_lock AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ap.is_lock AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(
            CASE
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN
                            CASE WHEN ap.is_lock THEN 20 ELSE 10 END
                        WHEN ABS((g.home_score + g.spread) - g.away_score) < 0.5 THEN 0
                        ELSE 0
                    END
                ELSE 0
            END
        ), 0) as anon_points
    INTO anon_stats
    FROM public.anonymous_picks ap
    JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = TRUE;
    
    -- Determine pick source
    IF auth_stats.total_picks > 0 AND anon_stats.anon_picks > 0 THEN
        final_pick_source := 'mixed';
    ELSIF auth_stats.total_picks > 0 THEN
        final_pick_source := 'authenticated';
    ELSIF anon_stats.anon_picks > 0 THEN
        final_pick_source := 'anonymous';
    ELSE
        -- No picks from either source, ensure user isn't on leaderboard
        DELETE FROM public.season_leaderboard WHERE user_id = target_user_id AND season = target_season;
        RETURN;
    END IF;
    
    -- Combine stats from both sources
    combined_stats := ROW(
        COALESCE(auth_stats.total_picks, 0) + COALESCE(anon_stats.anon_picks, 0),
        COALESCE(auth_stats.wins, 0) + COALESCE(anon_stats.anon_wins, 0),
        COALESCE(auth_stats.losses, 0) + COALESCE(anon_stats.anon_losses, 0),
        COALESCE(auth_stats.pushes, 0) + COALESCE(anon_stats.anon_pushes, 0),
        COALESCE(auth_stats.lock_wins, 0) + COALESCE(anon_stats.anon_lock_wins, 0),
        COALESCE(auth_stats.lock_losses, 0) + COALESCE(anon_stats.anon_lock_losses, 0),
        COALESCE(auth_stats.total_points, 0) + COALESCE(anon_stats.anon_points, 0)
    );
    
    -- Insert or update season leaderboard entry
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, 
        total_pushes, lock_wins, lock_losses, total_points, season_rank,
        payment_status, is_verified, pick_source
    ) VALUES (
        target_user_id,
        user_info.display_name,
        target_season,
        combined_stats.f1,  -- total_picks
        combined_stats.f2,  -- wins
        combined_stats.f3,  -- losses
        combined_stats.f4,  -- pushes
        combined_stats.f5,  -- lock_wins
        combined_stats.f6,  -- lock_losses
        combined_stats.f7,  -- total_points
        1, -- Temporary rank, will be updated
        user_info.payment_status,
        user_info.is_verified,
        final_pick_source
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
        updated_at = NOW();
    
    -- Update ranks for this season
    WITH ranked_entries AS (
        SELECT id, 
               ROW_NUMBER() OVER (ORDER BY total_points DESC, total_wins DESC) as new_rank
        FROM public.season_leaderboard
        WHERE season = target_season
    )
    UPDATE public.season_leaderboard sl
    SET season_rank = re.new_rank
    FROM ranked_entries re
    WHERE sl.id = re.id;
END;
$$;

-- Step 2: Update weekly leaderboard recalculation function
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
    
    -- Calculate stats from authenticated picks that are SUBMITTED
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
        AND p.submitted = TRUE  -- Check submitted flag instead of submitted_at
        AND p.show_on_leaderboard = TRUE;
    
    -- Calculate stats from anonymous picks
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
            g.status = 'completed' AND
            ap.is_lock AND
            ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
             (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score))
            THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN 
            g.status = 'completed' AND
            ap.is_lock AND
            NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                 (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
            ABS((g.home_score + g.spread) - g.away_score) >= 0.5
            THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(
            CASE
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN
                            CASE WHEN ap.is_lock THEN 20 ELSE 10 END
                        WHEN ABS((g.home_score + g.spread) - g.away_score) < 0.5 THEN 0
                        ELSE 0
                    END
                ELSE 0
            END
        ), 0) as anon_points
    INTO anon_stats
    FROM public.anonymous_picks ap
    JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.week = target_week 
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = TRUE;
    
    -- Determine pick source
    IF auth_stats.picks_made > 0 AND anon_stats.anon_picks > 0 THEN
        final_pick_source := 'mixed';
    ELSIF auth_stats.picks_made > 0 THEN
        final_pick_source := 'authenticated';
    ELSIF anon_stats.anon_picks > 0 THEN
        final_pick_source := 'anonymous';
    ELSE
        -- No picks from either source, ensure user isn't on leaderboard
        DELETE FROM public.weekly_leaderboard 
        WHERE user_id = target_user_id AND week = target_week AND season = target_season;
        RETURN;
    END IF;
    
    -- Combine stats from both sources
    combined_stats := ROW(
        COALESCE(auth_stats.picks_made, 0) + COALESCE(anon_stats.anon_picks, 0),
        COALESCE(auth_stats.wins, 0) + COALESCE(anon_stats.anon_wins, 0),
        COALESCE(auth_stats.losses, 0) + COALESCE(anon_stats.anon_losses, 0),
        COALESCE(auth_stats.pushes, 0) + COALESCE(anon_stats.anon_pushes, 0),
        COALESCE(auth_stats.lock_wins, 0) + COALESCE(anon_stats.anon_lock_wins, 0),
        COALESCE(auth_stats.lock_losses, 0) + COALESCE(anon_stats.anon_lock_losses, 0),
        COALESCE(auth_stats.total_points, 0) + COALESCE(anon_stats.anon_points, 0)
    );
    
    -- Insert or update weekly leaderboard entry
    INSERT INTO public.weekly_leaderboard (
        user_id, display_name, week, season, picks_made, wins, losses, 
        pushes, lock_wins, lock_losses, total_points, weekly_rank,
        payment_status, is_verified, pick_source
    ) VALUES (
        target_user_id,
        user_info.display_name,
        target_week,
        target_season,
        combined_stats.f1,  -- picks_made
        combined_stats.f2,  -- wins
        combined_stats.f3,  -- losses
        combined_stats.f4,  -- pushes
        combined_stats.f5,  -- lock_wins
        combined_stats.f6,  -- lock_losses
        combined_stats.f7,  -- total_points
        1, -- Temporary rank, will be updated
        user_info.payment_status,
        user_info.is_verified,
        final_pick_source
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
        updated_at = NOW();
    
    -- Update ranks for this week
    WITH ranked_entries AS (
        SELECT id, 
               ROW_NUMBER() OVER (ORDER BY total_points DESC, wins DESC) as new_rank
        FROM public.weekly_leaderboard
        WHERE week = target_week AND season = target_season
    )
    UPDATE public.weekly_leaderboard wl
    SET weekly_rank = re.new_rank
    FROM ranked_entries re
    WHERE wl.id = re.id;
END;
$$;

-- Step 3: Update the rebuild_season_leaderboard function
DROP FUNCTION IF EXISTS public.rebuild_season_leaderboard(INTEGER, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.rebuild_season_leaderboard(
    target_season INTEGER DEFAULT NULL,
    target_user_id UUID DEFAULT NULL,
    force_rebuild BOOLEAN DEFAULT false
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    admin_user RECORD;
    users_processed INTEGER := 0;
    entries_created INTEGER := 0;
    entries_updated INTEGER := 0;
    errors_encountered INTEGER := 0;
    error_log TEXT := '';
    user_rec RECORD;
    user_stats RECORD;
    mapped_payment_status TEXT;
    mapped_is_verified BOOLEAN;
    season_filter TEXT;
BEGIN
    -- Admin check
    SELECT u.id, u.email, u.is_admin 
    INTO admin_user
    FROM public.users u 
    WHERE u.email = auth.email() AND u.is_admin = true;
    
    IF admin_user IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Admin privileges required'
        );
    END IF;
    
    -- Determine season filter
    IF target_season IS NOT NULL THEN
        season_filter := 'season ' || target_season;
    ELSE
        season_filter := 'all seasons';
    END IF;
    
    -- Clear existing entries if force rebuild
    IF force_rebuild THEN
        IF target_user_id IS NOT NULL AND target_season IS NOT NULL THEN
            DELETE FROM public.season_leaderboard 
            WHERE user_id = target_user_id AND season = target_season;
        ELSIF target_season IS NOT NULL THEN
            DELETE FROM public.season_leaderboard 
            WHERE season = target_season;
        ELSIF target_user_id IS NOT NULL THEN
            DELETE FROM public.season_leaderboard 
            WHERE user_id = target_user_id;
        ELSE
            DELETE FROM public.season_leaderboard;
        END IF;
    END IF;
    
    -- Process each user with SUBMITTED picks in the target season(s)
    FOR user_rec IN 
        SELECT DISTINCT p.user_id, p.season, u.display_name
        FROM public.picks p
        JOIN public.users u ON u.id = p.user_id
        WHERE (target_season IS NULL OR p.season = target_season)
          AND (target_user_id IS NULL OR p.user_id = target_user_id)
          AND p.submitted = TRUE  -- Only count submitted picks
          AND p.show_on_leaderboard = true
    LOOP
        BEGIN
            users_processed := users_processed + 1;
            
            -- Calculate stats for this user/season (only submitted and visible picks)
            SELECT 
                COUNT(p.id) as total_picks,
                COUNT(CASE WHEN p.result = 'win' THEN 1 END) as total_wins,
                COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as total_losses,
                COUNT(CASE WHEN p.result = 'push' THEN 1 END) as total_pushes,
                COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
                COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
                COALESCE(SUM(p.points_earned), 0) as total_points
            INTO user_stats
            FROM public.picks p
            WHERE p.user_id = user_rec.user_id
              AND p.season = user_rec.season
              AND p.submitted = TRUE  -- Only count submitted picks
              AND p.show_on_leaderboard = true;
            
            -- Get payment status
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
            WHERE lsp.user_id = user_rec.user_id 
                AND lsp.season = user_rec.season;
            
            -- Set defaults if no payment record
            IF mapped_payment_status IS NULL THEN
                mapped_payment_status := 'NotPaid';
                mapped_is_verified := FALSE;
            END IF;
            
            -- UPSERT the leaderboard entry
            INSERT INTO public.season_leaderboard (
                user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
                lock_wins, lock_losses, total_points, season_rank, payment_status, is_verified
            ) VALUES (
                user_rec.user_id,
                COALESCE(user_rec.display_name, 'User ' || SUBSTRING(user_rec.user_id::TEXT, 1, 8)),
                user_rec.season,
                user_stats.total_picks,
                user_stats.total_wins,
                user_stats.total_losses,
                user_stats.total_pushes,
                user_stats.lock_wins,
                user_stats.lock_losses,
                user_stats.total_points,
                1, -- Temporary rank
                mapped_payment_status,
                mapped_is_verified
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
                updated_at = NOW();
                
            -- Track if this was insert or update
            GET DIAGNOSTICS entries_created = ROW_COUNT;
            IF entries_created = 1 THEN
                entries_created := entries_created + 1;
            ELSE
                entries_updated := entries_updated + 1;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            errors_encountered := errors_encountered + 1;
            error_log := error_log || 'User ' || user_rec.user_id || ' season ' || user_rec.season || ': ' || SQLERRM || '; ';
        END;
    END LOOP;
    
    -- Update all ranks for affected seasons
    FOR user_rec IN 
        SELECT DISTINCT season 
        FROM public.season_leaderboard 
        WHERE (target_season IS NULL OR season = target_season)
    LOOP
        BEGIN
            WITH ranked_entries AS (
                SELECT 
                    id, 
                    ROW_NUMBER() OVER (ORDER BY total_points DESC, total_wins DESC) as new_rank
                FROM public.season_leaderboard
                WHERE season = user_rec.season
            )
            UPDATE public.season_leaderboard sl
            SET season_rank = ranked_entries.new_rank
            FROM ranked_entries
            WHERE sl.id = ranked_entries.id;
            
        EXCEPTION WHEN OTHERS THEN
            error_log := error_log || 'Rank update for season ' || user_rec.season || ': ' || SQLERRM || '; ';
        END;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'operation', 'Season leaderboard rebuild',
        'scope', season_filter,
        'users_processed', users_processed,
        'entries_created', entries_created,
        'entries_updated', entries_updated,
        'errors_encountered', errors_encountered,
        'error_log', NULLIF(error_log, ''),
        'admin_user', admin_user.email
    );
END;
$$;

-- Step 4: Update trigger functions that update leaderboards when picks change
DROP FUNCTION IF EXISTS public.update_leaderboard_on_pick_change();

CREATE OR REPLACE FUNCTION public.update_leaderboard_on_pick_change()
RETURNS TRIGGER
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    -- Only update leaderboard if the pick is submitted
    IF NEW.submitted = TRUE THEN
        -- Recalculate weekly leaderboard
        PERFORM public.recalculate_weekly_leaderboard_for_user(NEW.user_id, NEW.week, NEW.season);
        
        -- Recalculate season leaderboard
        PERFORM public.recalculate_season_leaderboard_for_user(NEW.user_id, NEW.season);
    END IF;
    
    RETURN NEW;
END;
$$;

-- Re-create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_update_leaderboard_on_pick ON public.picks;
CREATE TRIGGER trigger_update_leaderboard_on_pick
    AFTER INSERT OR UPDATE OF result, points_earned, submitted, show_on_leaderboard
    ON public.picks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_leaderboard_on_pick_change();

-- Step 5: Add a function to clean up leaderboard entries for unsubmitted picks
CREATE OR REPLACE FUNCTION public.clean_unsubmitted_from_leaderboard()
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    admin_user RECORD;
    removed_weekly INTEGER := 0;
    removed_season INTEGER := 0;
BEGIN
    -- Admin check
    SELECT u.id, u.email, u.is_admin 
    INTO admin_user
    FROM public.users u 
    WHERE u.email = auth.email() AND u.is_admin = true;
    
    IF admin_user IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Admin privileges required'
        );
    END IF;
    
    -- Remove weekly leaderboard entries where user has no submitted picks for that week
    DELETE FROM public.weekly_leaderboard wl
    WHERE NOT EXISTS (
        SELECT 1 FROM public.picks p
        WHERE p.user_id = wl.user_id
          AND p.week = wl.week
          AND p.season = wl.season
          AND p.submitted = TRUE
          AND p.show_on_leaderboard = TRUE
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.anonymous_picks ap
        WHERE ap.assigned_user_id = wl.user_id
          AND ap.week = wl.week
          AND ap.season = wl.season
          AND ap.show_on_leaderboard = TRUE
    );
    
    GET DIAGNOSTICS removed_weekly = ROW_COUNT;
    
    -- Remove season leaderboard entries where user has no submitted picks for that season
    DELETE FROM public.season_leaderboard sl
    WHERE NOT EXISTS (
        SELECT 1 FROM public.picks p
        WHERE p.user_id = sl.user_id
          AND p.season = sl.season
          AND p.submitted = TRUE
          AND p.show_on_leaderboard = TRUE
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.anonymous_picks ap
        WHERE ap.assigned_user_id = sl.user_id
          AND ap.season = sl.season
          AND ap.show_on_leaderboard = TRUE
    );
    
    GET DIAGNOSTICS removed_season = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'success', true,
        'removed_weekly_entries', removed_weekly,
        'removed_season_entries', removed_season,
        'admin_user', admin_user.email
    );
END;
$$;

-- Step 6: Log the migration completion
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 130 completed successfully';
    RAISE NOTICE '📊 Leaderboard functions now properly filter by submitted flag';
    RAISE NOTICE '🧹 Run SELECT public.clean_unsubmitted_from_leaderboard() to remove any existing unsubmitted picks from leaderboards';
    RAISE NOTICE '🔄 Run SELECT public.rebuild_season_leaderboard(2024, NULL, true) to rebuild leaderboards with correct filtering';
END;
$$;