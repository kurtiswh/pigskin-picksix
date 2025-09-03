-- Fix the user_emails foreign key constraint issue during merges
-- The added_by field should allow NULL or ensure it's always a valid user ID

-- First, update the merge_users function to handle NULL added_by values properly
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
    
    -- Validate merged_by user exists if provided
    IF p_merged_by_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_merged_by_id) THEN
        -- If merged_by user doesn't exist, use target user as the merger
        p_merged_by_id := p_target_user_id;
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
    -- First, update existing emails from source user to point to target user
    -- This avoids the foreign key constraint issue
    UPDATE public.user_emails
    SET user_id = p_target_user_id,
        email_type = CASE 
            WHEN email_type = 'primary' THEN 'merged'
            ELSE email_type
        END,
        is_primary = false,
        source = COALESCE(source, 'Merged from user: ' || v_source_user.display_name),
        source_user_id = p_source_user_id,
        updated_at = NOW()
    WHERE user_id = p_source_user_id
        AND NOT EXISTS (
            SELECT 1 FROM public.user_emails t
            WHERE t.user_id = p_target_user_id
                AND t.email = user_emails.email
        );
    GET DIAGNOSTICS v_emails_merged = ROW_COUNT;
    
    -- Delete duplicate emails that couldn't be moved
    DELETE FROM public.user_emails
    WHERE user_id = p_source_user_id;
    
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
            COALESCE(p_merged_by_id, p_target_user_id)
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
        COALESCE(p_merged_by_id, p_target_user_id),
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

-- Also update the add_user_email function to handle NULL added_by
CREATE OR REPLACE FUNCTION add_user_email(
    p_user_id UUID,
    p_email TEXT,
    p_email_type VARCHAR(20) DEFAULT 'alternate',
    p_added_by UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_added_by UUID;
BEGIN
    -- If added_by is NULL or doesn't exist, use the user_id itself
    IF p_added_by IS NULL OR NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_added_by) THEN
        v_added_by := p_user_id;
    ELSE
        v_added_by := p_added_by;
    END IF;
    
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
        v_added_by,
        p_notes
    )
    ON CONFLICT (user_id, email) 
    DO UPDATE SET
        updated_at = NOW(),
        notes = COALESCE(EXCLUDED.notes, user_emails.notes);
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;