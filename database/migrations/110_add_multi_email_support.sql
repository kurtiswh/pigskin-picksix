-- Migration: Add multi-email support for user profiles
-- This allows tracking multiple emails per user and merging accounts

-- Create user_emails table to store multiple emails per user
CREATE TABLE IF NOT EXISTS public.user_emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    email_type VARCHAR(20) NOT NULL DEFAULT 'alternate',
    is_primary BOOLEAN DEFAULT FALSE,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMP WITH TIME ZONE,
    source VARCHAR(100), -- e.g., 'merged from user X', 'leaguesafe import', 'manual entry'
    source_user_id UUID, -- If merged from another user
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    added_by UUID REFERENCES public.users(id),
    season_used INTEGER[], -- Array of seasons this email was used
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT unique_user_email UNIQUE (user_id, email),
    CONSTRAINT email_type_check CHECK (email_type IN ('primary', 'leaguesafe', 'alternate', 'merged'))
);

-- Create user_merge_history table to track account merges
CREATE TABLE IF NOT EXISTS public.user_merge_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    target_user_id UUID NOT NULL REFERENCES public.users(id),
    source_user_id UUID NOT NULL, -- Original user that was merged (may be deleted)
    source_user_email TEXT NOT NULL,
    source_user_display_name TEXT NOT NULL,
    merged_by UUID NOT NULL REFERENCES public.users(id),
    merge_type VARCHAR(20) NOT NULL DEFAULT 'full',
    
    -- Store what was merged
    picks_merged INTEGER DEFAULT 0,
    payments_merged INTEGER DEFAULT 0,
    anonymous_picks_merged INTEGER DEFAULT 0,
    emails_merged INTEGER DEFAULT 0,
    
    -- Conflict resolution
    conflicts_detected BOOLEAN DEFAULT FALSE,
    conflict_resolution JSONB, -- Store how conflicts were resolved
    
    -- Metadata
    merge_reason TEXT,
    notes TEXT,
    merged_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT merge_type_check CHECK (merge_type IN ('full', 'partial', 'email_only'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_emails_user_id ON public.user_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_user_emails_email ON public.user_emails(email);
CREATE INDEX IF NOT EXISTS idx_user_emails_is_primary ON public.user_emails(user_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_merge_history_target ON public.user_merge_history(target_user_id);
CREATE INDEX IF NOT EXISTS idx_merge_history_source ON public.user_merge_history(source_user_id);
CREATE INDEX IF NOT EXISTS idx_merge_history_merged_at ON public.user_merge_history(merged_at DESC);

-- Enable RLS
ALTER TABLE public.user_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_merge_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_emails
CREATE POLICY "Users can view all emails" ON public.user_emails
    FOR SELECT USING (true);

CREATE POLICY "Users can manage own emails" ON public.user_emails
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all emails" ON public.user_emails
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
    );

-- RLS Policies for user_merge_history
CREATE POLICY "Anyone can view merge history" ON public.user_merge_history
    FOR SELECT USING (true);

CREATE POLICY "Only admins can create merge history" ON public.user_merge_history
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
    );

-- Migrate existing emails to the new table
-- First, add primary emails from users table
INSERT INTO public.user_emails (user_id, email, email_type, is_primary, is_verified, source)
SELECT 
    id,
    email,
    'primary',
    true,
    true,
    'original account'
FROM public.users
WHERE NOT EXISTS (
    SELECT 1 FROM public.user_emails 
    WHERE user_emails.user_id = users.id 
    AND user_emails.email = users.email
);

-- Add LeagueSafe emails if different from primary
INSERT INTO public.user_emails (user_id, email, email_type, is_primary, is_verified, source)
SELECT 
    id,
    leaguesafe_email,
    'leaguesafe',
    false,
    false,
    'leaguesafe profile'
FROM public.users
WHERE leaguesafe_email IS NOT NULL 
    AND leaguesafe_email != email
    AND NOT EXISTS (
        SELECT 1 FROM public.user_emails 
        WHERE user_emails.user_id = users.id 
        AND user_emails.email = users.leaguesafe_email
    );

-- Function to safely merge two users
CREATE OR REPLACE FUNCTION merge_users(
    p_source_user_id UUID,
    p_target_user_id UUID,
    p_merged_by_id UUID,
    p_merge_reason TEXT DEFAULT NULL,
    p_conflict_resolution JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_source_user RECORD;
    v_picks_merged INTEGER := 0;
    v_payments_merged INTEGER := 0;
    v_anonymous_picks_merged INTEGER := 0;
    v_emails_merged INTEGER := 0;
    v_conflicts_detected BOOLEAN := FALSE;
    v_conflict_details JSONB := '[]'::jsonb;
BEGIN
    -- Validate inputs
    IF p_source_user_id = p_target_user_id THEN
        RAISE EXCEPTION 'Cannot merge a user with itself';
    END IF;
    
    -- Get source user details before deletion
    SELECT * INTO v_source_user FROM public.users WHERE id = p_source_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source user not found';
    END IF;
    
    -- Check target user exists
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_target_user_id) THEN
        RAISE EXCEPTION 'Target user not found';
    END IF;
    
    -- Start merging data
    
    -- 1. Merge picks (check for conflicts)
    WITH conflict_check AS (
        SELECT 
            s.week,
            s.season,
            COUNT(*) as conflict_count
        FROM public.picks s
        JOIN public.picks t ON s.week = t.week AND s.season = t.season
        WHERE s.user_id = p_source_user_id 
            AND t.user_id = p_target_user_id
        GROUP BY s.week, s.season
    )
    SELECT COUNT(*) > 0 INTO v_conflicts_detected FROM conflict_check;
    
    IF v_conflicts_detected THEN
        -- Store conflict details
        SELECT jsonb_agg(jsonb_build_object(
            'type', 'picks',
            'week', week,
            'season', season
        )) INTO v_conflict_details
        FROM (
            SELECT DISTINCT s.week, s.season
            FROM public.picks s
            JOIN public.picks t ON s.week = t.week AND s.season = t.season
            WHERE s.user_id = p_source_user_id 
                AND t.user_id = p_target_user_id
        ) conflicts;
    END IF;
    
    -- Merge non-conflicting picks
    UPDATE public.picks 
    SET user_id = p_target_user_id,
        updated_at = NOW()
    WHERE user_id = p_source_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.picks t 
            WHERE t.user_id = p_target_user_id 
                AND t.week = picks.week 
                AND t.season = picks.season
        );
    GET DIAGNOSTICS v_picks_merged = ROW_COUNT;
    
    -- 2. Merge payments
    UPDATE public.leaguesafe_payments
    SET user_id = p_target_user_id,
        updated_at = NOW()
    WHERE user_id = p_source_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.leaguesafe_payments t
            WHERE t.user_id = p_target_user_id
                AND t.season = leaguesafe_payments.season
        );
    GET DIAGNOSTICS v_payments_merged = ROW_COUNT;
    
    -- 3. Merge anonymous picks assignments
    UPDATE public.anonymous_picks
    SET assigned_user_id = p_target_user_id
    WHERE assigned_user_id = p_source_user_id;
    GET DIAGNOSTICS v_anonymous_picks_merged = ROW_COUNT;
    
    -- 4. Merge email addresses
    INSERT INTO public.user_emails (
        user_id, 
        email, 
        email_type, 
        is_primary, 
        source,
        source_user_id,
        added_by
    )
    SELECT 
        p_target_user_id,
        email,
        'merged',
        false,
        'Merged from user: ' || v_source_user.display_name,
        p_source_user_id,
        p_merged_by_id
    FROM public.user_emails
    WHERE user_id = p_source_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.user_emails t
            WHERE t.user_id = p_target_user_id
                AND t.email = user_emails.email
        );
    GET DIAGNOSTICS v_emails_merged = ROW_COUNT;
    
    -- Also add the primary email from the source user if not already there
    IF NOT EXISTS (
        SELECT 1 FROM public.user_emails 
        WHERE user_id = p_target_user_id 
            AND email = v_source_user.email
    ) THEN
        INSERT INTO public.user_emails (
            user_id, 
            email, 
            email_type, 
            is_primary,
            source,
            source_user_id,
            added_by
        ) VALUES (
            p_target_user_id,
            v_source_user.email,
            'merged',
            false,
            'Merged from user: ' || v_source_user.display_name,
            p_source_user_id,
            p_merged_by_id
        );
        v_emails_merged := v_emails_merged + 1;
    END IF;
    
    -- 5. Update leaderboard entries
    UPDATE public.season_leaderboard
    SET user_id = p_target_user_id
    WHERE user_id = p_source_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.season_leaderboard t
            WHERE t.user_id = p_target_user_id
                AND t.season = season_leaderboard.season
        );
    
    UPDATE public.weekly_leaderboard
    SET user_id = p_target_user_id
    WHERE user_id = p_source_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.weekly_leaderboard t
            WHERE t.user_id = p_target_user_id
                AND t.season = weekly_leaderboard.season
                AND t.week = weekly_leaderboard.week
        );
    
    -- 6. Record the merge in history
    INSERT INTO public.user_merge_history (
        target_user_id,
        source_user_id,
        source_user_email,
        source_user_display_name,
        merged_by,
        merge_type,
        picks_merged,
        payments_merged,
        anonymous_picks_merged,
        emails_merged,
        conflicts_detected,
        conflict_resolution,
        merge_reason
    ) VALUES (
        p_target_user_id,
        p_source_user_id,
        v_source_user.email,
        v_source_user.display_name,
        p_merged_by_id,
        'full',
        v_picks_merged,
        v_payments_merged,
        v_anonymous_picks_merged,
        v_emails_merged,
        v_conflicts_detected,
        CASE 
            WHEN v_conflicts_detected THEN 
                jsonb_build_object(
                    'conflicts', v_conflict_details,
                    'resolution', p_conflict_resolution
                )
            ELSE NULL
        END,
        p_merge_reason
    );
    
    -- 7. Delete or deactivate the source user
    -- We'll soft delete by marking as merged
    UPDATE public.users
    SET 
        email = email || '_merged_' || NOW()::text,
        display_name = display_name || ' (Merged)',
        updated_at = NOW()
    WHERE id = p_source_user_id;
    
    -- Build result
    v_result := jsonb_build_object(
        'success', true,
        'picks_merged', v_picks_merged,
        'payments_merged', v_payments_merged,
        'anonymous_picks_merged', v_anonymous_picks_merged,
        'emails_merged', v_emails_merged,
        'conflicts_detected', v_conflicts_detected,
        'conflict_details', v_conflict_details
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add an email to a user
CREATE OR REPLACE FUNCTION add_user_email(
    p_user_id UUID,
    p_email TEXT,
    p_email_type VARCHAR(20) DEFAULT 'alternate',
    p_added_by UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO public.user_emails (
        user_id,
        email,
        email_type,
        is_primary,
        added_by,
        notes
    ) VALUES (
        p_user_id,
        LOWER(TRIM(p_email)),
        p_email_type,
        false,
        COALESCE(p_added_by, p_user_id),
        p_notes
    )
    ON CONFLICT (user_id, email) 
    DO UPDATE SET
        updated_at = NOW(),
        notes = COALESCE(EXCLUDED.notes, user_emails.notes);
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_emails_updated_at BEFORE UPDATE ON public.user_emails
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_merge_history_updated_at BEFORE UPDATE ON public.user_merge_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();