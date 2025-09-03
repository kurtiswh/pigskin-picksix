-- Migration 116: Individual Pick Set Management System
-- 
-- PURPOSE: Treat each pick set as a separate selectable entity
-- - Show individual pick sets with actual picks and games
-- - Allow admin to choose which specific pick set to use
-- - When selected, disable all other pick sets for that user/week

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 116: Individual pick set management system';
    RAISE NOTICE '==============================================================';
END;
$$;

-- Create table to store individual pick set preferences
CREATE TABLE IF NOT EXISTS public.user_pick_set_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,
    selected_pick_set_id TEXT NOT NULL, -- Format: 'auth' or 'anon:{email}' 
    selected_pick_set_type VARCHAR(20) NOT NULL CHECK (selected_pick_set_type IN ('authenticated', 'anonymous')),
    set_by_admin UUID REFERENCES public.users(id), 
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one active pick set per user per week
    UNIQUE(user_id, season, week)
);

-- Add RLS policies
ALTER TABLE public.user_pick_set_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to pick set preferences" ON public.user_pick_set_preferences
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
    );

-- Create view to show all pick sets for users with duplicates
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
      AND ap.show_on_leaderboard = true
      AND ap.validation_status IN ('auto_validated', 'manually_validated')
    GROUP BY u.id, u.display_name, ap.season, ap.week, ap.email
),
all_pick_sets AS (
    SELECT * FROM authenticated_pick_sets
    UNION ALL
    SELECT * FROM anonymous_pick_sets
),
users_with_multiple_sets AS (
    -- Only show users who have multiple pick sets for the same week
    SELECT 
        user_id,
        display_name,
        season,
        week,
        COUNT(*) as total_pick_sets
    FROM all_pick_sets
    GROUP BY user_id, display_name, season, week
    HAVING COUNT(*) > 1
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
            CASE WHEN upsp.selected_pick_set_id = aps.pick_set_id THEN 'SELECTED' ELSE 'DISABLED' END
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

-- Function to get pick details with game information
CREATE OR REPLACE FUNCTION public.get_pick_set_with_games(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER,
    pick_set_id TEXT
)
RETURNS TABLE(
    pick_set_info JSONB,
    picks_with_games JSONB
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    pick_set_type VARCHAR(20);
    pick_set_email TEXT;
BEGIN
    -- Parse pick set ID
    IF pick_set_id = 'auth' THEN
        pick_set_type := 'authenticated';
        pick_set_email := NULL;
    ELSE
        pick_set_type := 'anonymous';
        pick_set_email := SUBSTRING(pick_set_id FROM 6); -- Remove 'anon:' prefix
    END IF;
    
    IF pick_set_type = 'authenticated' THEN
        -- Get authenticated picks with game details
        RETURN QUERY
        SELECT 
            JSONB_BUILD_OBJECT(
                'pick_set_id', pick_set_id,
                'pick_set_type', 'authenticated',
                'source', 'User Account',
                'total_picks', COUNT(*),
                'lock_picks', COUNT(CASE WHEN p.is_lock THEN 1 END),
                'submitted_at', MAX(p.submitted_at)
            ) as pick_set_info,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'pick_id', p.id,
                    'selected_team', p.selected_team,
                    'is_lock', p.is_lock,
                    'points_earned', p.points_earned,
                    'result', p.result,
                    'game', JSONB_BUILD_OBJECT(
                        'id', g.id,
                        'home_team', g.home_team,
                        'away_team', g.away_team,
                        'spread', g.spread,
                        'home_score', g.home_score,
                        'away_score', g.away_score,
                        'status', g.status,
                        'game_time', g.game_time
                    )
                ) ORDER BY p.is_lock DESC, g.game_time
            ) as picks_with_games
        FROM public.picks p
        JOIN public.games g ON p.game_id = g.id
        WHERE p.user_id = target_user_id 
          AND p.season = target_season 
          AND p.week = target_week
          AND p.submitted_at IS NOT NULL;
    ELSE
        -- Get anonymous picks with game details
        RETURN QUERY
        SELECT 
            JSONB_BUILD_OBJECT(
                'pick_set_id', pick_set_id,
                'pick_set_type', 'anonymous',
                'source', pick_set_email,
                'total_picks', COUNT(*),
                'lock_picks', COUNT(CASE WHEN ap.is_lock THEN 1 END),
                'submitted_at', MIN(ap.created_at)
            ) as pick_set_info,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'pick_id', ap.id,
                    'selected_team', ap.selected_team,
                    'is_lock', ap.is_lock,
                    'points_earned', COALESCE(ap.points_earned, 0),
                    'result', 'pending',
                    'game', JSONB_BUILD_OBJECT(
                        'id', g.id,
                        'home_team', g.home_team,
                        'away_team', g.away_team,
                        'spread', g.spread,
                        'home_score', g.home_score,
                        'away_score', g.away_score,
                        'status', g.status,
                        'game_time', g.game_time
                    )
                ) ORDER BY ap.is_lock DESC, g.game_time
            ) as picks_with_games
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = target_user_id 
          AND ap.season = target_season 
          AND ap.week = target_week
          AND ap.email = pick_set_email
          AND ap.show_on_leaderboard = true
          AND ap.validation_status IN ('auto_validated', 'manually_validated');
    END IF;
END;
$$;

-- Function to select a pick set and disable others
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
    affected_authenticated INTEGER := 0;
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
    
    -- Store the preference
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
    
    -- Disable all other pick sets
    IF pick_set_type = 'authenticated' THEN
        -- Keep authenticated picks active, disable all anonymous picks
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = false
        WHERE assigned_user_id = target_user_id 
          AND season = target_season 
          AND week = target_week;
        GET DIAGNOSTICS affected_anonymous = ROW_COUNT;
    ELSE
        -- Keep selected anonymous picks active, disable others and authenticated picks
        UPDATE public.anonymous_picks 
        SET show_on_leaderboard = CASE 
            WHEN email = pick_set_email THEN true 
            ELSE false 
        END
        WHERE assigned_user_id = target_user_id 
          AND season = target_season 
          AND week = target_week;
        GET DIAGNOSTICS affected_anonymous = ROW_COUNT;
        
        -- Note: We can't "disable" authenticated picks, but leaderboard should prioritize admin choice
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

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_pick_set_preferences TO authenticated;
GRANT SELECT ON public.user_pick_sets_admin_view TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pick_set_with_games(UUID, INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_user_pick_set(UUID, INTEGER, INTEGER, TEXT, UUID, TEXT) TO authenticated;

-- Create indexes
CREATE INDEX idx_user_pick_set_preferences_user_season_week ON public.user_pick_set_preferences(user_id, season, week);

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 116 COMPLETED - Individual pick set management!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 NEW SYSTEM:';
    RAISE NOTICE '• Each pick set is treated as separate selectable entity';
    RAISE NOTICE '• user_pick_sets_admin_view shows all pick sets with details';
    RAISE NOTICE '• get_pick_set_with_games() shows actual picks and game info';
    RAISE NOTICE '• select_user_pick_set() chooses one and disables others';
    RAISE NOTICE '• Pick sets have unique IDs: "auth" or "anon:{email}"';
    RAISE NOTICE '';
    RAISE NOTICE '📝 Admin can now see and choose between individual pick sets!';
END;
$$;