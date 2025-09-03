-- Migration: Create Primary User Resolution System
-- This system ensures every email resolves to a single canonical user ID
-- and prevents the creation of duplicate user accounts

-- ===================================================================
-- PHASE 1: Add primary user designation to user_emails
-- ===================================================================

-- Add is_primary_user_email flag to designate which user should be the canonical one
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'user_emails' AND column_name = 'is_primary_user_email') THEN
        ALTER TABLE public.user_emails 
        ADD COLUMN is_primary_user_email BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Add canonical_user_id to track which user should be used as primary
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'canonical_user_id') THEN
        ALTER TABLE public.users 
        ADD COLUMN canonical_user_id UUID REFERENCES public.users(id);
    END IF;
END $$;

-- Add merge status to track merged users
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'user_status') THEN
        ALTER TABLE public.users 
        ADD COLUMN user_status VARCHAR(20) DEFAULT 'active';
    END IF;
END $$;

-- Add constraint for user_status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_user_status_check') THEN
        ALTER TABLE public.users 
        ADD CONSTRAINT users_user_status_check 
        CHECK (user_status IN ('active', 'merged', 'disabled'));
    END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_emails_primary_user_flag 
    ON public.user_emails(is_primary_user_email, user_id);

CREATE INDEX IF NOT EXISTS idx_users_canonical_user_id 
    ON public.users(canonical_user_id);

CREATE INDEX IF NOT EXISTS idx_users_status 
    ON public.users(user_status);

-- ===================================================================
-- PHASE 2: Create primary user resolution functions
-- ===================================================================

-- Function to find the primary user for any email address
CREATE OR REPLACE FUNCTION public.resolve_primary_user_id(search_email TEXT)
RETURNS UUID
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    primary_user_id UUID;
    found_user_id UUID;
    canonical_id UUID;
BEGIN
    search_email := LOWER(TRIM(search_email));
    
    -- First, check user_emails table for this email
    SELECT ue.user_id INTO found_user_id
    FROM public.user_emails ue
    JOIN public.users u ON ue.user_id = u.id
    WHERE ue.email = search_email
        AND u.user_status = 'active'
        AND ue.is_primary_user_email = true
    LIMIT 1;
    
    IF found_user_id IS NOT NULL THEN
        -- Check if this user has a canonical_user_id pointing elsewhere
        SELECT canonical_user_id INTO canonical_id
        FROM public.users
        WHERE id = found_user_id;
        
        RETURN COALESCE(canonical_id, found_user_id);
    END IF;
    
    -- If no primary designation found, look for any user with this email
    SELECT ue.user_id INTO found_user_id
    FROM public.user_emails ue
    JOIN public.users u ON ue.user_id = u.id
    WHERE ue.email = search_email
        AND u.user_status = 'active'
    ORDER BY ue.created_at ASC -- Prefer older accounts
    LIMIT 1;
    
    IF found_user_id IS NOT NULL THEN
        -- Check canonical_user_id
        SELECT canonical_user_id INTO canonical_id
        FROM public.users
        WHERE id = found_user_id;
        
        RETURN COALESCE(canonical_id, found_user_id);
    END IF;
    
    -- Finally, check the users table directly (fallback for legacy data)
    SELECT id INTO found_user_id
    FROM public.users
    WHERE (email = search_email OR leaguesafe_email = search_email)
        AND user_status = 'active'
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF found_user_id IS NOT NULL THEN
        SELECT canonical_user_id INTO canonical_id
        FROM public.users
        WHERE id = found_user_id;
        
        RETURN COALESCE(canonical_id, found_user_id);
    END IF;
    
    -- No user found
    RETURN NULL;
END;
$$;

-- Function to consolidate a user under a primary user ID
CREATE OR REPLACE FUNCTION public.consolidate_user_under_primary(
    secondary_user_id UUID,
    primary_user_id UUID,
    consolidated_by UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    secondary_user RECORD;
    primary_user RECORD;
BEGIN
    -- Validate inputs
    IF secondary_user_id = primary_user_id THEN
        RAISE EXCEPTION 'Cannot consolidate a user under itself';
    END IF;
    
    -- Get user records
    SELECT * INTO secondary_user FROM public.users WHERE id = secondary_user_id AND user_status = 'active';
    SELECT * INTO primary_user FROM public.users WHERE id = primary_user_id AND user_status = 'active';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'One or both users not found or not active';
    END IF;
    
    -- Set canonical_user_id for secondary user
    UPDATE public.users
    SET canonical_user_id = primary_user_id,
        user_status = 'merged',
        updated_at = NOW()
    WHERE id = secondary_user_id;
    
    -- Move all emails from secondary to primary user (if not duplicates)
    INSERT INTO public.user_emails (
        user_id, 
        email, 
        email_type, 
        is_primary,
        is_verified,
        source,
        source_user_id,
        added_by,
        notes
    )
    SELECT 
        primary_user_id,
        email,
        'consolidated',
        false, -- Never make consolidated emails primary
        is_verified,
        COALESCE(source, 'Consolidated from user: ' || secondary_user.display_name),
        secondary_user_id,
        consolidated_by,
        COALESCE(notes, 'User consolidation')
    FROM public.user_emails se
    WHERE se.user_id = secondary_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.user_emails pe
            WHERE pe.user_id = primary_user_id
                AND pe.email = se.email
        );
    
    -- Move picks from secondary to primary user (non-conflicting only)
    UPDATE public.picks
    SET user_id = primary_user_id,
        updated_at = NOW()
    WHERE user_id = secondary_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.picks pp
            WHERE pp.user_id = primary_user_id
                AND pp.week = picks.week
                AND pp.season = picks.season
        );
    
    -- Move anonymous picks assignments
    UPDATE public.anonymous_picks
    SET assigned_user_id = primary_user_id
    WHERE assigned_user_id = secondary_user_id;
    
    -- Move leaguesafe payments
    UPDATE public.leaguesafe_payments
    SET user_id = primary_user_id,
        updated_at = NOW()
    WHERE user_id = secondary_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.leaguesafe_payments pp
            WHERE pp.user_id = primary_user_id
                AND pp.season = leaguesafe_payments.season
        );
    
    -- Update leaderboards
    UPDATE public.season_leaderboard
    SET user_id = primary_user_id
    WHERE user_id = secondary_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.season_leaderboard sl
            WHERE sl.user_id = primary_user_id
                AND sl.season = season_leaderboard.season
        );
    
    UPDATE public.weekly_leaderboard
    SET user_id = primary_user_id
    WHERE user_id = secondary_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.weekly_leaderboard wl
            WHERE wl.user_id = primary_user_id
                AND wl.season = weekly_leaderboard.season
                AND wl.week = weekly_leaderboard.week
        );
    
    -- Remove old emails from secondary user
    DELETE FROM public.user_emails WHERE user_id = secondary_user_id;
    
    RETURN TRUE;
END;
$$;

-- Function to designate a user as primary for all their emails
CREATE OR REPLACE FUNCTION public.designate_primary_user_for_emails(
    target_user_id UUID
)
RETURNS BOOLEAN
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    -- Remove primary designation from all emails for this user
    UPDATE public.user_emails
    SET is_primary_user_email = false
    WHERE user_id = target_user_id;
    
    -- Set the oldest/first email as primary
    UPDATE public.user_emails
    SET is_primary_user_email = true
    WHERE user_id = target_user_id
        AND id = (
            SELECT id FROM public.user_emails
            WHERE user_id = target_user_id
            ORDER BY created_at ASC
            LIMIT 1
        );
    
    RETURN TRUE;
END;
$$;

-- ===================================================================
-- PHASE 3: Create comprehensive duplicate detection functions
-- ===================================================================

-- Function to find all pick sets for a user across both tables
CREATE OR REPLACE FUNCTION public.find_all_user_pick_sets(
    target_user_id UUID,
    target_week INTEGER,
    target_season INTEGER
)
RETURNS TABLE(
    source_type TEXT,
    pick_set_id TEXT,
    submitted_at TIMESTAMPTZ,
    pick_count INTEGER,
    is_active BOOLEAN,
    total_points INTEGER,
    pick_details JSONB
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    -- Authenticated picks
    SELECT 
        'authenticated'::TEXT as source_type,
        'auth_' || MIN(p.id)::TEXT as pick_set_id,
        p.submitted_at,
        COUNT(*)::INTEGER as pick_count,
        bool_or(p.submitted) as is_active,
        COALESCE(SUM(p.points_earned), 0)::INTEGER as total_points,
        jsonb_agg(jsonb_build_object(
            'id', p.id,
            'game_id', p.game_id,
            'selected_team', p.selected_team,
            'is_lock', p.is_lock,
            'result', p.result,
            'points_earned', p.points_earned,
            'home_team', g.home_team,
            'away_team', g.away_team
        )) as pick_details
    FROM public.picks p
    JOIN public.games g ON p.game_id = g.id
    WHERE p.user_id = target_user_id
        AND p.week = target_week
        AND p.season = target_season
    GROUP BY p.submitted_at
    
    UNION ALL
    
    -- Anonymous picks
    SELECT 
        'anonymous'::TEXT as source_type,
        'anon_' || MIN(ap.id)::TEXT as pick_set_id,
        ap.submitted_at,
        COUNT(*)::INTEGER as pick_count,
        bool_or(ap.show_on_leaderboard) as is_active,
        COALESCE(SUM(CASE 
            WHEN g.status = 'completed' THEN
                CASE 
                    WHEN (g.home_score + g.spread) = g.away_score THEN 10
                    WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                          (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN 
                        CASE WHEN ap.is_lock THEN 40 ELSE 20 END
                    ELSE 0
                END
            ELSE 0
        END), 0)::INTEGER as total_points,
        jsonb_agg(jsonb_build_object(
            'id', ap.id,
            'game_id', ap.game_id,
            'selected_team', ap.selected_team,
            'is_lock', ap.is_lock,
            'result', CASE 
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN (g.home_score + g.spread) = g.away_score THEN 'push'
                        WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN 'win'
                        ELSE 'loss'
                    END
                ELSE NULL
            END,
            'points_earned', CASE 
                WHEN g.status = 'completed' THEN
                    CASE 
                        WHEN (g.home_score + g.spread) = g.away_score THEN 10
                        WHEN ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                              (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) THEN 
                            CASE WHEN ap.is_lock THEN 40 ELSE 20 END
                        ELSE 0
                    END
                ELSE NULL
            END,
            'home_team', ap.home_team,
            'away_team', ap.away_team,
            'email', ap.email,
            'validation_status', ap.validation_status,
            'show_on_leaderboard', ap.show_on_leaderboard
        )) as pick_details
    FROM public.anonymous_picks ap
    LEFT JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id
        AND ap.week = target_week
        AND ap.season = target_season
    GROUP BY ap.submitted_at
    
    ORDER BY submitted_at DESC;
END;
$$;

-- ===================================================================
-- PHASE 4: Migration of existing data
-- ===================================================================

-- Designate primary users for all existing emails
DO $$
DECLARE
    user_record RECORD;
BEGIN
    FOR user_record IN 
        SELECT DISTINCT user_id FROM public.user_emails WHERE is_primary_user_email IS NULL OR is_primary_user_email = false
    LOOP
        PERFORM public.designate_primary_user_for_emails(user_record.user_id);
    END LOOP;
    
    RAISE NOTICE 'Designated primary emails for all users';
END $$;

-- Set all active users' canonical_user_id to themselves initially
UPDATE public.users 
SET canonical_user_id = id 
WHERE user_status = 'active' AND canonical_user_id IS NULL;

-- ===================================================================
-- PHASE 5: Create validation constraints
-- ===================================================================

-- Constraint: anonymous picks on leaderboard must have assigned user
ALTER TABLE public.anonymous_picks 
ADD CONSTRAINT anonymous_picks_leaderboard_requires_user 
CHECK (
    (show_on_leaderboard = false) OR 
    (show_on_leaderboard = true AND assigned_user_id IS NOT NULL)
);

-- Constraint: users can only have one primary email designation per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_emails_one_primary_per_user
    ON public.user_emails(user_id)
    WHERE is_primary_user_email = true;

-- ===================================================================
-- PHASE 6: Update RLS policies for primary user resolution
-- ===================================================================

-- Update user_emails policies to work with canonical user resolution
DROP POLICY IF EXISTS "Users can manage own emails" ON public.user_emails;
CREATE POLICY "Users can manage own emails" ON public.user_emails
    FOR ALL USING (
        auth.uid() = user_id OR 
        auth.uid() = (SELECT canonical_user_id FROM public.users WHERE id = user_id)
    );

-- Comments
COMMENT ON FUNCTION public.resolve_primary_user_id(TEXT) IS 'Resolves any email address to its canonical/primary user ID';
COMMENT ON FUNCTION public.consolidate_user_under_primary(UUID, UUID, UUID) IS 'Consolidates a secondary user account under a primary user account';
COMMENT ON FUNCTION public.designate_primary_user_for_emails(UUID) IS 'Designates a user as the primary user for all their email addresses';
COMMENT ON FUNCTION public.find_all_user_pick_sets(UUID, INTEGER, INTEGER) IS 'Finds all pick sets for a user across authenticated and anonymous picks tables';

COMMENT ON COLUMN public.user_emails.is_primary_user_email IS 'Designates which user should be considered the canonical/primary user for this email';
COMMENT ON COLUMN public.users.canonical_user_id IS 'Points to the canonical user ID if this user has been consolidated under another user';
COMMENT ON COLUMN public.users.user_status IS 'Status of the user account: active, merged, or disabled';

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 112 completed: Primary User Resolution System created';
    RAISE NOTICE 'Key features:';
    RAISE NOTICE '- Primary user resolution for any email address';
    RAISE NOTICE '- User consolidation system to prevent duplicate accounts';
    RAISE NOTICE '- Comprehensive duplicate pick detection across both tables';
    RAISE NOTICE '- Database constraints preventing orphaned leaderboard entries';
    RAISE NOTICE '- RLS policies updated to work with canonical user IDs';
END $$;