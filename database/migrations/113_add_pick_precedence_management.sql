-- Migration: Add Pick Precedence Management System
-- This ensures only one pick set per user per week can be active on the leaderboard
-- and provides admin tools to manage conflicts between authenticated and anonymous picks

-- ===================================================================
-- PHASE 1: Add pick precedence columns
-- ===================================================================

-- Add precedence management to picks table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picks' AND column_name = 'is_active_pick_set') THEN
        ALTER TABLE public.picks 
        ADD COLUMN is_active_pick_set BOOLEAN DEFAULT TRUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picks' AND column_name = 'pick_set_priority') THEN
        ALTER TABLE public.picks 
        ADD COLUMN pick_set_priority INTEGER DEFAULT 100; -- Higher number = higher priority
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'picks' AND column_name = 'precedence_notes') THEN
        ALTER TABLE public.picks 
        ADD COLUMN precedence_notes TEXT;
    END IF;
END $$;

-- Add precedence management to anonymous_picks table (extend existing show_on_leaderboard)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anonymous_picks' AND column_name = 'pick_set_priority') THEN
        ALTER TABLE public.anonymous_picks 
        ADD COLUMN pick_set_priority INTEGER DEFAULT 50; -- Lower than authenticated picks by default
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'anonymous_picks' AND column_name = 'precedence_notes') THEN
        ALTER TABLE public.anonymous_picks 
        ADD COLUMN precedence_notes TEXT;
    END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_picks_active_priority 
    ON public.picks(user_id, week, season, is_active_pick_set, pick_set_priority);

CREATE INDEX IF NOT EXISTS idx_anonymous_picks_active_priority 
    ON public.anonymous_picks(assigned_user_id, week, season, show_on_leaderboard, pick_set_priority);

-- ===================================================================
-- PHASE 2: Create pick precedence management functions
-- ===================================================================

-- Function to manage pick set precedence for a user/week/season
CREATE OR REPLACE FUNCTION public.manage_pick_set_precedence(
    target_user_id UUID,
    target_week INTEGER,
    target_season INTEGER,
    active_pick_source TEXT,
    active_pick_set_id TEXT DEFAULT NULL, -- For grouping picks by submitted_at
    admin_user_id UUID DEFAULT NULL,
    notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    affected_auth_picks INTEGER := 0;
    affected_anon_picks INTEGER := 0;
BEGIN
    -- Validate inputs
    IF target_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID cannot be null';
    END IF;
    
    IF active_pick_source NOT IN ('authenticated', 'anonymous') THEN
        RAISE EXCEPTION 'active_pick_source must be either ''authenticated'' or ''anonymous''';
    END IF;
    
    IF active_pick_source = 'authenticated' THEN
        -- Set authenticated picks as active, anonymous as inactive
        
        -- Activate authenticated picks for this user/week/season
        UPDATE public.picks
        SET is_active_pick_set = true,
            pick_set_priority = 100,
            precedence_notes = COALESCE(notes, 'Set as active by precedence management - ' || NOW()::TEXT),
            updated_at = NOW()
        WHERE user_id = target_user_id
            AND week = target_week
            AND season = target_season
            AND submitted = true;
        
        GET DIAGNOSTICS affected_auth_picks = ROW_COUNT;
        
        -- Deactivate anonymous picks for this user/week/season  
        UPDATE public.anonymous_picks
        SET show_on_leaderboard = false,
            pick_set_priority = 25,
            precedence_notes = COALESCE(notes, 'Deactivated - authenticated picks take precedence - ' || NOW()::TEXT),
            processing_notes = COALESCE(processing_notes, '') || ' | Precedence: deactivated for authenticated picks'
        WHERE assigned_user_id = target_user_id
            AND week = target_week
            AND season = target_season;
        
        GET DIAGNOSTICS affected_anon_picks = ROW_COUNT;
        
    ELSIF active_pick_source = 'anonymous' THEN
        -- Set anonymous picks as active, authenticated as inactive
        
        -- Deactivate authenticated picks for this user/week/season
        UPDATE public.picks
        SET is_active_pick_set = false,
            pick_set_priority = 75,
            precedence_notes = COALESCE(notes, 'Deactivated - anonymous picks take precedence - ' || NOW()::TEXT),
            updated_at = NOW()
        WHERE user_id = target_user_id
            AND week = target_week
            AND season = target_season;
        
        GET DIAGNOSTICS affected_auth_picks = ROW_COUNT;
        
        -- Activate anonymous picks for this user/week/season
        -- If active_pick_set_id is provided, only activate that specific pick set
        IF active_pick_set_id IS NOT NULL THEN
            -- Parse pick set ID to get submission time
            -- Format expected: "anon_submission_timestamp"
            UPDATE public.anonymous_picks
            SET show_on_leaderboard = CASE
                WHEN 'anon_' || DATE_TRUNC('minute', submitted_at)::TEXT = active_pick_set_id THEN true
                ELSE false
            END,
            pick_set_priority = CASE
                WHEN 'anon_' || DATE_TRUNC('minute', submitted_at)::TEXT = active_pick_set_id THEN 100
                ELSE 25
            END,
            precedence_notes = CASE
                WHEN 'anon_' || DATE_TRUNC('minute', submitted_at)::TEXT = active_pick_set_id 
                THEN COALESCE(notes, 'Set as active anonymous pick set - ' || NOW()::TEXT)
                ELSE COALESCE(notes, 'Deactivated - other anonymous pick set selected - ' || NOW()::TEXT)
            END,
            processing_notes = COALESCE(processing_notes, '') || 
                CASE
                    WHEN 'anon_' || DATE_TRUNC('minute', submitted_at)::TEXT = active_pick_set_id 
                    THEN ' | Precedence: activated as primary anonymous pick set'
                    ELSE ' | Precedence: deactivated in favor of other anonymous pick set'
                END
            WHERE assigned_user_id = target_user_id
                AND week = target_week
                AND season = target_season;
        ELSE
            -- Activate all anonymous picks for this user/week/season
            UPDATE public.anonymous_picks
            SET show_on_leaderboard = true,
                pick_set_priority = 100,
                precedence_notes = COALESCE(notes, 'Activated - anonymous picks take precedence - ' || NOW()::TEXT),
                processing_notes = COALESCE(processing_notes, '') || ' | Precedence: activated over authenticated picks'
            WHERE assigned_user_id = target_user_id
                AND week = target_week
                AND season = target_season;
        END IF;
        
        GET DIAGNOSTICS affected_anon_picks = ROW_COUNT;
    END IF;
    
    -- Log the precedence change in a system log table (if it exists)
    -- This could be extended to create an audit trail
    
    RAISE NOTICE 'Pick precedence updated for user % week % season %: % auth picks, % anon picks affected',
        target_user_id, target_week, target_season, affected_auth_picks, affected_anon_picks;
    
    RETURN true;
END;
$$;

-- Function to get current pick precedence status for a user
CREATE OR REPLACE FUNCTION public.get_pick_precedence_status(
    target_user_id UUID,
    target_week INTEGER,
    target_season INTEGER
)
RETURNS TABLE(
    source_type TEXT,
    pick_count INTEGER,
    is_active BOOLEAN,
    priority INTEGER,
    last_updated TIMESTAMPTZ,
    notes TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    -- Authenticated picks status
    SELECT 
        'authenticated'::TEXT as source_type,
        COUNT(*)::INTEGER as pick_count,
        bool_and(p.is_active_pick_set) as is_active,
        MAX(p.pick_set_priority)::INTEGER as priority,
        MAX(p.updated_at) as last_updated,
        string_agg(DISTINCT p.precedence_notes, '; ') as notes
    FROM public.picks p
    WHERE p.user_id = target_user_id
        AND p.week = target_week
        AND p.season = target_season
        AND p.submitted = true
    HAVING COUNT(*) > 0
    
    UNION ALL
    
    -- Anonymous picks status
    SELECT 
        'anonymous'::TEXT as source_type,
        COUNT(*)::INTEGER as pick_count,
        bool_and(ap.show_on_leaderboard) as is_active,
        MAX(ap.pick_set_priority)::INTEGER as priority,
        MAX(ap.updated_at) as last_updated,
        string_agg(DISTINCT ap.precedence_notes, '; ') as notes
    FROM public.anonymous_picks ap
    WHERE ap.assigned_user_id = target_user_id
        AND ap.week = target_week
        AND ap.season = target_season
    HAVING COUNT(*) > 0
    
    ORDER BY priority DESC, source_type;
END;
$$;

-- ===================================================================
-- PHASE 3: Enhanced leaderboard functions that respect precedence
-- ===================================================================

-- Enhanced function to calculate user points respecting pick precedence
CREATE OR REPLACE FUNCTION public.calculate_user_points_with_precedence(
    target_user_id UUID,
    target_week INTEGER DEFAULT NULL,
    target_season INTEGER DEFAULT NULL
)
RETURNS TABLE(
    week INTEGER,
    season INTEGER,
    total_points INTEGER,
    active_source TEXT,
    auth_picks INTEGER,
    anon_picks INTEGER
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH week_points AS (
        -- Get points from active authenticated picks
        SELECT 
            p.week,
            p.season,
            COALESCE(SUM(p.points_earned), 0)::INTEGER as auth_points,
            COUNT(*)::INTEGER as auth_count,
            0::INTEGER as anon_points,
            0::INTEGER as anon_count
        FROM public.picks p
        WHERE p.user_id = target_user_id
            AND p.is_active_pick_set = true
            AND p.submitted = true
            AND p.result IS NOT NULL
            AND (target_week IS NULL OR p.week = target_week)
            AND (target_season IS NULL OR p.season = target_season)
        GROUP BY p.week, p.season
        
        UNION ALL
        
        -- Get points from active anonymous picks
        SELECT 
            ap.week,
            ap.season,
            0::INTEGER as auth_points,
            0::INTEGER as auth_count,
            COALESCE(SUM(
                CASE 
                    WHEN g.status = 'completed' THEN
                        CASE 
                            WHEN (g.home_score + g.spread) = g.away_score THEN 10
                            WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN 
                                CASE WHEN ap.is_lock THEN 40 ELSE 20 END
                            ELSE 0
                        END
                    ELSE 0
                END
            ), 0)::INTEGER as anon_points,
            COUNT(*)::INTEGER as anon_count
        FROM public.anonymous_picks ap
        LEFT JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = target_user_id
            AND ap.show_on_leaderboard = true
            AND (target_week IS NULL OR ap.week = target_week)
            AND (target_season IS NULL OR ap.season = target_season)
        GROUP BY ap.week, ap.season
    )
    SELECT 
        wp.week,
        wp.season,
        (SUM(wp.auth_points) + SUM(wp.anon_points))::INTEGER as total_points,
        CASE 
            WHEN SUM(wp.auth_count) > 0 AND SUM(wp.anon_count) > 0 THEN 'mixed'
            WHEN SUM(wp.auth_count) > 0 THEN 'authenticated'
            WHEN SUM(wp.anon_count) > 0 THEN 'anonymous'
            ELSE 'none'
        END as active_source,
        SUM(wp.auth_count)::INTEGER as auth_picks,
        SUM(wp.anon_count)::INTEGER as anon_picks
    FROM week_points wp
    GROUP BY wp.week, wp.season
    ORDER BY wp.season DESC, wp.week DESC;
END;
$$;

-- ===================================================================
-- PHASE 4: Create audit trail table for precedence changes
-- ===================================================================

CREATE TABLE IF NOT EXISTS public.pick_precedence_audit (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id),
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    previous_active_source TEXT,
    new_active_source TEXT,
    admin_user_id UUID REFERENCES public.users(id),
    change_reason TEXT,
    affected_auth_picks INTEGER DEFAULT 0,
    affected_anon_picks INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT valid_source_values CHECK (
        previous_active_source IN ('authenticated', 'anonymous', 'none', 'mixed') AND
        new_active_source IN ('authenticated', 'anonymous', 'none', 'mixed')
    )
);

CREATE INDEX IF NOT EXISTS idx_pick_precedence_audit_user_week 
    ON public.pick_precedence_audit(user_id, week, season);

CREATE INDEX IF NOT EXISTS idx_pick_precedence_audit_admin 
    ON public.pick_precedence_audit(admin_user_id, created_at);

-- Enable RLS on audit table
ALTER TABLE public.pick_precedence_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pick precedence audit" ON public.pick_precedence_audit
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
    );

-- ===================================================================
-- PHASE 5: Update existing data to set appropriate precedence
-- ===================================================================

-- Set all existing authenticated picks as active with high priority
UPDATE public.picks 
SET is_active_pick_set = true,
    pick_set_priority = 100,
    precedence_notes = 'Migration: Default authenticated picks to active'
WHERE is_active_pick_set IS NULL AND submitted = true;

-- Set anonymous picks priority based on whether they're on leaderboard
UPDATE public.anonymous_picks 
SET pick_set_priority = CASE 
    WHEN show_on_leaderboard = true THEN 100
    ELSE 25
END,
precedence_notes = CASE 
    WHEN show_on_leaderboard = true THEN 'Migration: Active anonymous picks'
    ELSE 'Migration: Inactive anonymous picks'
END
WHERE pick_set_priority IS NULL;

-- ===================================================================
-- PHASE 6: Create helper views for admin dashboard
-- ===================================================================

-- View to show pick conflicts that need admin attention
CREATE OR REPLACE VIEW public.pick_conflicts_needing_resolution AS
SELECT DISTINCT
    u.id as user_id,
    u.display_name,
    u.email,
    p.week,
    p.season,
    COUNT(DISTINCT CASE WHEN p.submitted = true THEN p.id END) as auth_picks,
    COUNT(DISTINCT CASE WHEN ap.show_on_leaderboard = true THEN ap.id END) as anon_picks,
    bool_and(p.is_active_pick_set) as auth_active,
    bool_and(ap.show_on_leaderboard) as anon_active
FROM public.users u
LEFT JOIN public.picks p ON u.id = p.user_id
LEFT JOIN public.anonymous_picks ap ON u.id = ap.assigned_user_id
WHERE (p.week IS NOT NULL OR ap.week IS NOT NULL)
    AND (p.season IS NOT NULL OR ap.season IS NOT NULL)
GROUP BY u.id, u.display_name, u.email, p.week, p.season
HAVING COUNT(DISTINCT CASE WHEN p.submitted = true THEN p.id END) > 0
   AND COUNT(DISTINCT CASE WHEN ap.assigned_user_id IS NOT NULL THEN ap.id END) > 0
ORDER BY p.season DESC, p.week DESC, u.display_name;

-- Comments
COMMENT ON FUNCTION public.manage_pick_set_precedence(UUID, INTEGER, INTEGER, TEXT, TEXT, UUID, TEXT) IS 'Manages which pick set (authenticated vs anonymous) is active for a user in a given week';
COMMENT ON FUNCTION public.get_pick_precedence_status(UUID, INTEGER, INTEGER) IS 'Returns the current precedence status for all pick sets for a user/week/season';
COMMENT ON FUNCTION public.calculate_user_points_with_precedence(UUID, INTEGER, INTEGER) IS 'Calculates user points respecting pick set precedence rules';
COMMENT ON VIEW public.pick_conflicts_needing_resolution IS 'Shows users who have both authenticated and anonymous picks that may need precedence resolution';

COMMENT ON COLUMN public.picks.is_active_pick_set IS 'Whether this pick set should be used for leaderboard calculations';
COMMENT ON COLUMN public.picks.pick_set_priority IS 'Priority level for precedence management (higher = more priority)';
COMMENT ON COLUMN public.picks.precedence_notes IS 'Admin notes about precedence decisions for this pick set';

COMMENT ON COLUMN public.anonymous_picks.pick_set_priority IS 'Priority level for precedence management (higher = more priority)';
COMMENT ON COLUMN public.anonymous_picks.precedence_notes IS 'Admin notes about precedence decisions for this pick set';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 113 completed: Pick Precedence Management System';
    RAISE NOTICE 'Key features:';
    RAISE NOTICE '- Pick set precedence management with priority system';
    RAISE NOTICE '- Admin tools to resolve conflicts between authenticated and anonymous picks';
    RAISE NOTICE '- Audit trail for precedence changes';
    RAISE NOTICE '- Enhanced leaderboard calculations respecting precedence';
    RAISE NOTICE '- Helper views to identify conflicts needing resolution';
    RAISE NOTICE '- Database constraints ensuring data integrity';
END $$;