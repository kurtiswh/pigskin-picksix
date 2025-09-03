-- Migration 118: Keep Duplicates Visible and Improve Display
-- 
-- PURPOSE: Always show duplicate scenarios even after admin selection
-- - Update view to show all users with multiple pick sets regardless of selection
-- - Keep admin choice visible for transparency

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 118: Keep duplicates visible and improve display';
    RAISE NOTICE '===============================================================';
END;
$$;

-- Update view to always show users with multiple pick sets, regardless of admin selection
CREATE OR REPLACE VIEW public.user_pick_sets_admin_view AS
WITH authenticated_pick_sets AS (
    -- Get authenticated pick sets
    SELECT 
        u.id as user_id,
        u.display_name,
        p.season,
        p.week,
        'authenticated' as pick_set_type,
        'auth' as pick_set_id,
        'User Account' as pick_set_source,
        COUNT(*) as pick_count,
        COUNT(CASE WHEN p.is_lock THEN 1 END) as lock_count,
        MIN(p.created_at) as created_at,
        MAX(p.submitted_at) as submitted_at,
        -- Get actual picks as JSON
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'game_id', p.game_id,
                'selected_team', p.selected_team,
                'is_lock', p.is_lock,
                'points_earned', p.points_earned,
                'result', p.result
            ) ORDER BY p.is_lock DESC, p.created_at
        ) as picks_detail
    FROM public.picks p
    JOIN public.users u ON p.user_id = u.id
    WHERE p.submitted_at IS NOT NULL
    GROUP BY u.id, u.display_name, p.season, p.week
),
anonymous_pick_sets AS (
    -- Get anonymous pick sets (grouped by email)
    SELECT 
        u.id as user_id,
        u.display_name,
        ap.season,
        ap.week,
        'anonymous' as pick_set_type,
        'anon:' || ap.email as pick_set_id,
        ap.email as pick_set_source,
        COUNT(*) as pick_count,
        COUNT(CASE WHEN ap.is_lock THEN 1 END) as lock_count,
        MIN(ap.created_at) as created_at,
        NULL::timestamp as submitted_at,
        -- Get actual picks as JSON
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'game_id', ap.game_id,
                'selected_team', ap.selected_team,
                'is_lock', ap.is_lock,
                'points_earned', COALESCE(ap.points_earned, 0),
                'result', 'pending'
            ) ORDER BY ap.is_lock DESC, ap.created_at
        ) as picks_detail
    FROM public.anonymous_picks ap
    JOIN public.users u ON ap.assigned_user_id = u.id
    WHERE ap.assigned_user_id IS NOT NULL
      AND ap.validation_status IN ('auto_validated', 'manually_validated')
    GROUP BY u.id, u.display_name, ap.season, ap.week, ap.email
),
all_pick_sets AS (
    SELECT * FROM authenticated_pick_sets
    UNION ALL
    SELECT * FROM anonymous_pick_sets
),
users_with_multiple_sets AS (
    -- ALWAYS show users who have multiple pick sets, regardless of admin choice
    SELECT 
        user_id,
        display_name,
        season,
        week,
        COUNT(*) as total_pick_sets
    FROM all_pick_sets
    GROUP BY user_id, display_name, season, week
    HAVING COUNT(*) > 1  -- Keep this condition to show duplicates
)
SELECT 
    aps.*,
    upsp.selected_pick_set_id = aps.pick_set_id as is_selected,
    upsp.reasoning as admin_reasoning,
    upsp.set_by_admin,
    admin_user.display_name as admin_name,
    upsp.created_at as preference_set_at,
    CASE 
        WHEN upsp.selected_pick_set_id IS NOT NULL THEN 
            CASE WHEN upsp.selected_pick_set_id = aps.pick_set_id THEN 'SELECTED' ELSE 'NOT_SELECTED' END
        ELSE 'AVAILABLE'
    END as status
FROM all_pick_sets aps
JOIN users_with_multiple_sets umwms ON 
    aps.user_id = umwms.user_id 
    AND aps.season = umwms.season 
    AND aps.week = umwms.week
LEFT JOIN public.user_pick_set_preferences upsp ON 
    aps.user_id = upsp.user_id 
    AND aps.season = upsp.season 
    AND aps.week = upsp.week
LEFT JOIN public.users admin_user ON upsp.set_by_admin = admin_user.id
ORDER BY aps.season, aps.week, aps.display_name, aps.pick_set_type, aps.pick_set_source;

-- Update the select function to only affect leaderboard visibility, not the admin view
CREATE OR REPLACE FUNCTION public.select_user_pick_set(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER,
    selected_pick_set_id TEXT,
    admin_user_id UUID,
    reasoning_text TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    pick_set_type VARCHAR(20);
    pick_set_email TEXT;
    affected_anonymous INTEGER := 0;
BEGIN
    -- Parse pick set ID
    IF selected_pick_set_id = 'auth' THEN
        pick_set_type := 'authenticated';
        pick_set_email := NULL;
    ELSE
        pick_set_type := 'anonymous';
        pick_set_email := SUBSTRING(selected_pick_set_id FROM 6); -- Remove 'anon:' prefix
    END IF;
    
    -- Store the preference (this doesn't remove from admin view, just records choice)
    INSERT INTO public.user_pick_set_preferences (
        user_id, season, week, selected_pick_set_id, selected_pick_set_type, 
        set_by_admin, reasoning
    ) VALUES (
        target_user_id, target_season, target_week, selected_pick_set_id, 
        pick_set_type, admin_user_id, reasoning_text
    )
    ON CONFLICT (user_id, season, week)
    DO UPDATE SET
        selected_pick_set_id = EXCLUDED.selected_pick_set_id,
        selected_pick_set_type = EXCLUDED.selected_pick_set_type,
        set_by_admin = EXCLUDED.set_by_admin,
        reasoning = EXCLUDED.reasoning,
        updated_at = CURRENT_TIMESTAMP;
    
    -- Update leaderboard visibility (affects scoring, not admin view)
    IF pick_set_type = 'authenticated' THEN
        -- Keep authenticated picks active, hide all anonymous picks from leaderboard
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = false
        WHERE assigned_user_id = target_user_id 
          AND season = target_season 
          AND week = target_week;
        GET DIAGNOSTICS affected_anonymous = ROW_COUNT;
    ELSE
        -- Keep selected anonymous picks active, hide others from leaderboard
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = CASE 
            WHEN email = pick_set_email THEN true 
            ELSE false 
        END
        WHERE assigned_user_id = target_user_id 
          AND season = target_season 
          AND week = target_week;
        GET DIAGNOSTICS affected_anonymous = ROW_COUNT;
    END IF;
    
    -- Refresh leaderboards
    PERFORM public.update_season_leaderboard_with_source(target_user_id, target_season, pick_set_type);
    PERFORM public.update_weekly_leaderboard_with_source(target_user_id, target_week, target_season, pick_set_type);
    
    RETURN JSONB_BUILD_OBJECT(
        'success', true,
        'selected_pick_set', selected_pick_set_id,
        'affected_anonymous_picks', affected_anonymous,
        'message', 'Pick set selection updated successfully'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN JSONB_BUILD_OBJECT(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 118 COMPLETED - Duplicates remain visible!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 CHANGES:';
    RAISE NOTICE '• Admin view always shows all pick sets for users with duplicates';
    RAISE NOTICE '• Admin selection only affects leaderboard scoring, not visibility';
    RAISE NOTICE '• Status shows SELECTED/NOT_SELECTED/AVAILABLE for clarity';
    RAISE NOTICE '• Provides transparency on admin decisions';
    RAISE NOTICE '';
END;
$$;