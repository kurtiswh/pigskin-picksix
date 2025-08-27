-- Migration 049: Comprehensive Anonymous Picks Management System
-- 
-- OVERVIEW: Complete overhaul of anonymous picks management with proper validation status tracking,
-- leaderboard control, and anonymous attribution system
--
-- FEATURES:
-- - Validation status tracking (pending_validation, auto_validated, manually_validated, duplicate_conflict)
-- - Processing notes for admin audit trail
-- - Pick source attribution for leaderboards (authenticated vs anonymous)
-- - Enhanced leaderboard integration with proper show_on_leaderboard respect

-- ===================================================================
-- PHASE 1: Add validation status and tracking columns
-- ===================================================================

-- Add validation status tracking to anonymous_picks
DO $$
BEGIN
    -- Add validation status column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anonymous_picks' AND column_name = 'validation_status') THEN
        ALTER TABLE public.anonymous_picks 
        ADD COLUMN validation_status VARCHAR(20) DEFAULT 'pending_validation';
    END IF;
    
    -- Add processing notes for admin tracking
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anonymous_picks' AND column_name = 'processing_notes') THEN
        ALTER TABLE public.anonymous_picks 
        ADD COLUMN processing_notes TEXT;
    END IF;
    
    RAISE NOTICE 'Added validation status and processing notes columns to anonymous_picks';
END $$;

-- Create check constraint for validation_status values
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'anonymous_picks_validation_status_check') THEN
        ALTER TABLE public.anonymous_picks 
        ADD CONSTRAINT anonymous_picks_validation_status_check 
        CHECK (validation_status IN ('pending_validation', 'auto_validated', 'manually_validated', 'duplicate_conflict'));
    END IF;
END $$;

-- ===================================================================
-- PHASE 2: Add pick source attribution to leaderboard tables
-- ===================================================================

-- Add pick_source to season_leaderboard for anonymous attribution
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'season_leaderboard' AND column_name = 'pick_source') THEN
        ALTER TABLE public.season_leaderboard 
        ADD COLUMN pick_source VARCHAR(20) DEFAULT 'authenticated';
    END IF;
END $$;

-- Add pick_source to weekly_leaderboard for anonymous attribution
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'weekly_leaderboard' AND column_name = 'pick_source') THEN
        ALTER TABLE public.weekly_leaderboard 
        ADD COLUMN pick_source VARCHAR(20) DEFAULT 'authenticated';
    END IF;
END $$;

-- Create check constraints for pick_source values
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'season_leaderboard_pick_source_check') THEN
        ALTER TABLE public.season_leaderboard 
        ADD CONSTRAINT season_leaderboard_pick_source_check 
        CHECK (pick_source IN ('authenticated', 'anonymous'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_leaderboard_pick_source_check') THEN
        ALTER TABLE public.weekly_leaderboard 
        ADD CONSTRAINT weekly_leaderboard_pick_source_check 
        CHECK (pick_source IN ('authenticated', 'anonymous'));
    END IF;
END $$;

-- ===================================================================
-- PHASE 3: Create performance indexes
-- ===================================================================

-- Indexes for anonymous_picks filtering and management
CREATE INDEX IF NOT EXISTS idx_anonymous_picks_validation_status 
    ON public.anonymous_picks(validation_status);

CREATE INDEX IF NOT EXISTS idx_anonymous_picks_season_week_status 
    ON public.anonymous_picks(season, week, validation_status);

CREATE INDEX IF NOT EXISTS idx_anonymous_picks_assigned_status 
    ON public.anonymous_picks(assigned_user_id, validation_status) 
    WHERE assigned_user_id IS NOT NULL;

-- Indexes for leaderboard source attribution
CREATE INDEX IF NOT EXISTS idx_season_leaderboard_pick_source 
    ON public.season_leaderboard(pick_source, season);

CREATE INDEX IF NOT EXISTS idx_weekly_leaderboard_pick_source 
    ON public.weekly_leaderboard(pick_source, week, season);

-- ===================================================================
-- PHASE 4: Migrate existing data to new status system
-- ===================================================================

-- Update existing anonymous picks with appropriate validation status
UPDATE public.anonymous_picks 
SET validation_status = CASE 
    -- Auto-validated: assigned + validated email + on leaderboard
    WHEN assigned_user_id IS NOT NULL 
         AND is_validated = true 
         AND show_on_leaderboard = true THEN 'auto_validated'
    
    -- Manually validated: assigned but not validated email OR explicitly hidden
    WHEN assigned_user_id IS NOT NULL 
         AND (is_validated = false OR show_on_leaderboard = false) THEN 'manually_validated'
    
    -- Pending validation: not assigned but has validated email
    WHEN assigned_user_id IS NULL 
         AND is_validated = true THEN 'pending_validation'
    
    -- Default: pending validation
    ELSE 'pending_validation'
END,
processing_notes = CASE 
    WHEN assigned_user_id IS NOT NULL AND is_validated = true 
    THEN 'Migrated: Auto-validated during migration'
    
    WHEN assigned_user_id IS NOT NULL AND is_validated = false 
    THEN 'Migrated: Manually validated during migration'
    
    ELSE 'Migrated: Pending validation'
END
WHERE validation_status = 'pending_validation'; -- Only update unmigrated records

-- Update existing leaderboard entries to mark as authenticated (default behavior)
UPDATE public.season_leaderboard 
SET pick_source = 'authenticated' 
WHERE pick_source IS NULL;

UPDATE public.weekly_leaderboard 
SET pick_source = 'authenticated' 
WHERE pick_source IS NULL;

-- ===================================================================
-- PHASE 5: Update handle_anonymous_pick_assignment function
-- ===================================================================

-- Enhanced function that respects show_on_leaderboard and sets proper attribution
CREATE OR REPLACE FUNCTION public.handle_anonymous_pick_assignment()
RETURNS TRIGGER
SECURITY DEFINER  -- Maintain SECURITY DEFINER from Migration 047
LANGUAGE plpgsql AS $$
DECLARE
    pick_record RECORD;
BEGIN
    -- Only process if assigned_user_id was changed (null to not-null or different user)
    IF (OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id) AND NEW.assigned_user_id IS NOT NULL THEN
        
        -- Only process picks that should show on leaderboard
        IF NEW.show_on_leaderboard = true THEN
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
            
            -- Use the enhanced trigger functions that handle source attribution
            -- These will be called with NEW/OLD records that include pick source info
            
            -- Temporarily create a picks-like record for the existing trigger functions
            -- We'll simulate the trigger by calling the updated leaderboard functions directly
            PERFORM public.update_season_leaderboard_with_source(NEW.assigned_user_id, NEW.season, 'anonymous');
            PERFORM public.update_weekly_leaderboard_with_source(NEW.assigned_user_id, NEW.week, NEW.season, 'anonymous');
        END IF;
        
        -- Update validation status based on the assignment type
        UPDATE public.anonymous_picks 
        SET validation_status = CASE 
            WHEN NEW.is_validated = true THEN 'auto_validated'
            ELSE 'manually_validated'
        END,
        processing_notes = COALESCE(processing_notes, '') || 
            CASE 
                WHEN NEW.show_on_leaderboard = true THEN ' | Assigned and added to leaderboard'
                ELSE ' | Assigned but hidden from leaderboard'
            END
        WHERE id = NEW.id;
        
    END IF;
    
    -- Handle show_on_leaderboard changes for already assigned picks
    IF (OLD.show_on_leaderboard IS DISTINCT FROM NEW.show_on_leaderboard) AND NEW.assigned_user_id IS NOT NULL THEN
        IF NEW.show_on_leaderboard = true THEN
            -- Add to leaderboard
            PERFORM public.update_season_leaderboard_with_source(NEW.assigned_user_id, NEW.season, 'anonymous');
            PERFORM public.update_weekly_leaderboard_with_source(NEW.assigned_user_id, NEW.week, NEW.season, 'anonymous');
        ELSE
            -- Remove from leaderboard (recalculate without this pick)
            PERFORM public.update_season_leaderboard_with_source(NEW.assigned_user_id, NEW.season, 'anonymous');
            PERFORM public.update_weekly_leaderboard_with_source(NEW.assigned_user_id, NEW.week, NEW.season, 'anonymous');
        END IF;
        
        -- Update processing notes
        UPDATE public.anonymous_picks 
        SET processing_notes = COALESCE(processing_notes, '') || 
            CASE 
                WHEN NEW.show_on_leaderboard = true THEN ' | Added to leaderboard'
                ELSE ' | Removed from leaderboard'
            END
        WHERE id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- ===================================================================
-- PHASE 6: Create helper functions for leaderboard updates with source
-- ===================================================================

-- Helper function to update season leaderboard with source attribution
CREATE OR REPLACE FUNCTION public.update_season_leaderboard_with_source(
    target_user_id UUID,
    target_season INTEGER,
    source_type VARCHAR(20)
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_stats RECORD;
    user_info RECORD;
    anonymous_stats RECORD;
BEGIN
    -- Get user display name and payment info
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
    
    -- Calculate stats from authenticated picks
    SELECT 
        COUNT(*) as total_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock = true THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock = true THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_stats
    FROM public.picks 
    WHERE user_id = target_user_id 
        AND season = target_season 
        AND result IS NOT NULL;
    
    -- Add stats from anonymous picks that should show on leaderboard
    SELECT 
        COUNT(*) as anon_picks,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND
             ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
            THEN 1 END) as anon_wins,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND
             NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
             (g.home_score + g.spread) != g.away_score)
            THEN 1 END) as anon_losses,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND (g.home_score + g.spread) = g.away_score)
            THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND ap.is_lock = true AND
             ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
            THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND ap.is_lock = true AND
             NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
             (g.home_score + g.spread) != g.away_score)
            THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(CASE 
            WHEN g.status = 'completed' THEN
                CASE 
                    WHEN (g.home_score + g.spread) = g.away_score THEN 10 -- push
                    WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                          (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN 
                        CASE WHEN ap.is_lock THEN 40 ELSE 20 END -- win
                    ELSE 0 -- loss
                END
            ELSE 0
        END), 0) as anon_points
    INTO anonymous_stats
    FROM public.anonymous_picks ap
    LEFT JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = true;
    
    -- Combine stats
    user_stats.total_picks := COALESCE(user_stats.total_picks, 0) + COALESCE(anonymous_stats.anon_picks, 0);
    user_stats.wins := COALESCE(user_stats.wins, 0) + COALESCE(anonymous_stats.anon_wins, 0);
    user_stats.losses := COALESCE(user_stats.losses, 0) + COALESCE(anonymous_stats.anon_losses, 0);
    user_stats.pushes := COALESCE(user_stats.pushes, 0) + COALESCE(anonymous_stats.anon_pushes, 0);
    user_stats.lock_wins := COALESCE(user_stats.lock_wins, 0) + COALESCE(anonymous_stats.anon_lock_wins, 0);
    user_stats.lock_losses := COALESCE(user_stats.lock_losses, 0) + COALESCE(anonymous_stats.anon_lock_losses, 0);
    user_stats.total_points := COALESCE(user_stats.total_points, 0) + COALESCE(anonymous_stats.anon_points, 0);
    
    -- Insert or update season leaderboard with source information
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
    ) VALUES (
        target_user_id, user_info.display_name, target_season, user_stats.total_picks,
        user_stats.wins, user_stats.losses, user_stats.pushes, user_stats.lock_wins,
        user_stats.lock_losses, user_stats.total_points, user_info.payment_status,
        user_info.is_verified,
        CASE WHEN anonymous_stats.anon_picks > 0 THEN 'anonymous' ELSE 'authenticated' END
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
        pick_source = EXCLUDED.pick_source;
END;
$$;

-- Similar helper function for weekly leaderboard
CREATE OR REPLACE FUNCTION public.update_weekly_leaderboard_with_source(
    target_user_id UUID,
    target_week INTEGER,
    target_season INTEGER,
    source_type VARCHAR(20)
)
RETURNS VOID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    user_stats RECORD;
    user_info RECORD;
    anonymous_stats RECORD;
BEGIN
    -- Get user display name and payment info
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
    
    -- Calculate stats from authenticated picks
    SELECT 
        COUNT(*) as total_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock = true THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock = true THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_stats
    FROM public.picks 
    WHERE user_id = target_user_id 
        AND week = target_week
        AND season = target_season 
        AND result IS NOT NULL;
    
    -- Add stats from anonymous picks that should show on leaderboard
    SELECT 
        COUNT(*) as anon_picks,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND
             ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
            THEN 1 END) as anon_wins,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND
             NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
             (g.home_score + g.spread) != g.away_score)
            THEN 1 END) as anon_losses,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND (g.home_score + g.spread) = g.away_score)
            THEN 1 END) as anon_pushes,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND ap.is_lock = true AND
             ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
            THEN 1 END) as anon_lock_wins,
        COUNT(CASE WHEN 
            (g.status = 'completed' AND ap.is_lock = true AND
             NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
             (g.home_score + g.spread) != g.away_score)
            THEN 1 END) as anon_lock_losses,
        COALESCE(SUM(CASE 
            WHEN g.status = 'completed' THEN
                CASE 
                    WHEN (g.home_score + g.spread) = g.away_score THEN 10 -- push
                    WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                          (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN 
                        CASE WHEN ap.is_lock THEN 40 ELSE 20 END -- win
                    ELSE 0 -- loss
                END
            ELSE 0
        END), 0) as anon_points
    INTO anonymous_stats
    FROM public.anonymous_picks ap
    LEFT JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
        AND ap.week = target_week
        AND ap.season = target_season 
        AND ap.show_on_leaderboard = true;
    
    -- Combine stats
    user_stats.total_picks := COALESCE(user_stats.total_picks, 0) + COALESCE(anonymous_stats.anon_picks, 0);
    user_stats.wins := COALESCE(user_stats.wins, 0) + COALESCE(anonymous_stats.anon_wins, 0);
    user_stats.losses := COALESCE(user_stats.losses, 0) + COALESCE(anonymous_stats.anon_losses, 0);
    user_stats.pushes := COALESCE(user_stats.pushes, 0) + COALESCE(anonymous_stats.anon_pushes, 0);
    user_stats.lock_wins := COALESCE(user_stats.lock_wins, 0) + COALESCE(anonymous_stats.anon_lock_wins, 0);
    user_stats.lock_losses := COALESCE(user_stats.lock_losses, 0) + COALESCE(anonymous_stats.anon_lock_losses, 0);
    user_stats.total_points := COALESCE(user_stats.total_points, 0) + COALESCE(anonymous_stats.anon_points, 0);
    
    -- Insert or update weekly leaderboard with source information
    INSERT INTO public.weekly_leaderboard (
        user_id, display_name, week, season, picks_made, wins, losses, pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
    ) VALUES (
        target_user_id, user_info.display_name, target_week, target_season, user_stats.total_picks,
        user_stats.wins, user_stats.losses, user_stats.pushes, user_stats.lock_wins,
        user_stats.lock_losses, user_stats.total_points, user_info.payment_status,
        user_info.is_verified,
        CASE WHEN anonymous_stats.anon_picks > 0 THEN 'anonymous' ELSE 'authenticated' END
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
        pick_source = EXCLUDED.pick_source;
END;
$$;

-- ===================================================================
-- PHASE 7: Comments and completion
-- ===================================================================

COMMENT ON COLUMN public.anonymous_picks.validation_status IS 'Tracks the validation status of anonymous picks: pending_validation, auto_validated, manually_validated, duplicate_conflict';
COMMENT ON COLUMN public.anonymous_picks.processing_notes IS 'Admin notes for tracking the processing history of anonymous picks';
COMMENT ON COLUMN public.season_leaderboard.pick_source IS 'Indicates whether leaderboard entry includes anonymous picks: authenticated, anonymous';
COMMENT ON COLUMN public.weekly_leaderboard.pick_source IS 'Indicates whether leaderboard entry includes anonymous picks: authenticated, anonymous';

COMMENT ON FUNCTION public.handle_anonymous_pick_assignment() IS 'Enhanced trigger function that respects show_on_leaderboard flag and tracks validation status';
COMMENT ON FUNCTION public.update_season_leaderboard_with_source(UUID, INTEGER, VARCHAR) IS 'Updates season leaderboard combining authenticated and anonymous picks with source attribution';
COMMENT ON FUNCTION public.update_weekly_leaderboard_with_source(UUID, INTEGER, INTEGER, VARCHAR) IS 'Updates weekly leaderboard combining authenticated and anonymous picks with source attribution';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 049 completed: Comprehensive Anonymous Picks Management System';
    RAISE NOTICE 'Features added:';
    RAISE NOTICE '- Validation status tracking with 4 states';
    RAISE NOTICE '- Processing notes for admin audit trail'; 
    RAISE NOTICE '- Pick source attribution for leaderboards';
    RAISE NOTICE '- Enhanced leaderboard integration respecting show_on_leaderboard flag';
    RAISE NOTICE '- Helper functions for combining authenticated and anonymous picks';
END $$;