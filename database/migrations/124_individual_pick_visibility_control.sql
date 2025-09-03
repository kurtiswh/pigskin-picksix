-- Migration 122: Individual Pick Visibility and Custom Combination Control
-- 
-- PURPOSE: Allow admins to create custom pick combinations by selecting individual picks
-- from different pick sets and choosing which picks are visible for scoring.
--
-- FEATURES:
-- - Individual pick visibility controls for both authenticated and anonymous picks
-- - Custom pick set combinations with specific lock pick selection
-- - Maintain existing pick set precedence while allowing granular control
-- - Leaderboard scoring based only on visible/selected picks

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 122: Individual pick visibility and combination control';
    RAISE NOTICE '=====================================================================';
END;
$$;

-- Add individual pick visibility controls to picks table
ALTER TABLE public.picks 
ADD COLUMN IF NOT EXISTS show_in_combination BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS combination_is_lock BOOLEAN DEFAULT NULL, -- NULL = use original is_lock, TRUE/FALSE = override
ADD COLUMN IF NOT EXISTS combination_set_by UUID REFERENCES public.users(id),
ADD COLUMN IF NOT EXISTS combination_reasoning TEXT,
ADD COLUMN IF NOT EXISTS combination_updated_at TIMESTAMP WITH TIME ZONE;

-- Add individual pick visibility controls to anonymous_picks table
ALTER TABLE public.anonymous_picks 
ADD COLUMN IF NOT EXISTS show_in_combination BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS combination_is_lock BOOLEAN DEFAULT NULL, -- NULL = use original is_lock, TRUE/FALSE = override
ADD COLUMN IF NOT EXISTS combination_set_by UUID REFERENCES public.users(id),
ADD COLUMN IF NOT EXISTS combination_reasoning TEXT,
ADD COLUMN IF NOT EXISTS combination_updated_at TIMESTAMP WITH TIME ZONE;

-- Create table to track custom pick combinations
CREATE TABLE IF NOT EXISTS public.user_custom_pick_combinations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    week INTEGER NOT NULL,
    
    -- Track which picks are selected from which sets
    selected_picks_summary JSONB NOT NULL, -- Array of pick IDs and their sources
    lock_pick_id TEXT, -- ID of the pick serving as lock (format: 'pick:{uuid}' or 'anon:{uuid}')
    lock_pick_source TEXT, -- 'authenticated' or 'anonymous'
    
    -- Admin tracking
    created_by UUID NOT NULL REFERENCES public.users(id),
    reasoning TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- One combination per user per week
    UNIQUE(user_id, season, week)
);

-- Add RLS policies
ALTER TABLE public.user_custom_pick_combinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access to custom pick combinations" ON public.user_custom_pick_combinations
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
    );

-- Function to create/update a custom pick combination
CREATE OR REPLACE FUNCTION public.create_custom_pick_combination(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER,
    selected_picks JSONB, -- Array of objects: [{"pick_id": "uuid", "source": "authenticated|anonymous", "is_lock": boolean}]
    admin_user_id UUID,
    reasoning_text TEXT DEFAULT NULL
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    pick_info JSONB;
    pick_id TEXT;
    pick_source TEXT;
    is_lock_pick BOOLEAN;
    lock_pick_count INTEGER := 0;
    total_picks INTEGER;
    affected_auth_picks INTEGER := 0;
    affected_anon_picks INTEGER := 0;
    lock_pick_id_result TEXT := NULL;
    lock_pick_source_result TEXT := NULL;
BEGIN
    -- Validate input
    total_picks := JSONB_ARRAY_LENGTH(selected_picks);
    
    IF total_picks != 6 THEN
        RETURN JSONB_BUILD_OBJECT(
            'success', false,
            'error', 'Must select exactly 6 picks'
        );
    END IF;
    
    -- First pass: Reset all picks for this user/week to not show in combination
    UPDATE public.picks 
    SET 
        show_in_combination = false,
        combination_is_lock = NULL,
        combination_set_by = admin_user_id,
        combination_updated_at = CURRENT_TIMESTAMP
    WHERE user_id = target_user_id 
      AND season = target_season 
      AND week = target_week;
    GET DIAGNOSTICS affected_auth_picks = ROW_COUNT;
    
    UPDATE public.anonymous_picks 
    SET 
        show_in_combination = false,
        combination_is_lock = NULL,
        combination_set_by = admin_user_id,
        combination_updated_at = CURRENT_TIMESTAMP
    WHERE assigned_user_id = target_user_id 
      AND season = target_season 
      AND week = target_week;
    GET DIAGNOSTICS affected_anon_picks = ROW_COUNT;
    
    -- Second pass: Enable selected picks and set lock status
    FOR i IN 0..(total_picks - 1) LOOP
        pick_info := selected_picks -> i;
        pick_id := pick_info ->> 'pick_id';
        pick_source := pick_info ->> 'source';
        is_lock_pick := (pick_info ->> 'is_lock')::boolean;
        
        IF is_lock_pick THEN
            lock_pick_count := lock_pick_count + 1;
            lock_pick_id_result := pick_id;
            lock_pick_source_result := pick_source;
        END IF;
        
        IF pick_source = 'authenticated' THEN
            UPDATE public.picks 
            SET 
                show_in_combination = true,
                combination_is_lock = is_lock_pick,
                combination_set_by = admin_user_id,
                combination_reasoning = reasoning_text,
                combination_updated_at = CURRENT_TIMESTAMP
            WHERE id = pick_id::uuid
              AND user_id = target_user_id 
              AND season = target_season 
              AND week = target_week;
        ELSE
            UPDATE public.anonymous_picks 
            SET 
                show_in_combination = true,
                combination_is_lock = is_lock_pick,
                combination_set_by = admin_user_id,
                combination_reasoning = reasoning_text,
                combination_updated_at = CURRENT_TIMESTAMP
            WHERE id = pick_id::uuid
              AND assigned_user_id = target_user_id 
              AND season = target_season 
              AND week = target_week;
        END IF;
    END LOOP;
    
    -- Validate exactly one lock pick
    IF lock_pick_count != 1 THEN
        RETURN JSONB_BUILD_OBJECT(
            'success', false,
            'error', 'Must select exactly 1 lock pick'
        );
    END IF;
    
    -- Store the combination record
    INSERT INTO public.user_custom_pick_combinations (
        user_id, season, week, selected_picks_summary, 
        lock_pick_id, lock_pick_source, created_by, reasoning
    ) VALUES (
        target_user_id, target_season, target_week, selected_picks,
        lock_pick_id_result, lock_pick_source_result, admin_user_id, reasoning_text
    )
    ON CONFLICT (user_id, season, week)
    DO UPDATE SET
        selected_picks_summary = EXCLUDED.selected_picks_summary,
        lock_pick_id = EXCLUDED.lock_pick_id,
        lock_pick_source = EXCLUDED.lock_pick_source,
        created_by = EXCLUDED.created_by,
        reasoning = EXCLUDED.reasoning,
        updated_at = CURRENT_TIMESTAMP;
    
    -- Refresh leaderboards to reflect the new combination
    PERFORM public.refresh_all_leaderboards(target_season);
    
    RETURN JSONB_BUILD_OBJECT(
        'success', true,
        'total_picks_selected', total_picks,
        'lock_pick_id', lock_pick_id_result,
        'lock_pick_source', lock_pick_source_result,
        'affected_auth_picks', affected_auth_picks,
        'affected_anon_picks', affected_anon_picks,
        'message', 'Custom pick combination created successfully'
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN JSONB_BUILD_OBJECT(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Function to get current custom combination for a user/week
CREATE OR REPLACE FUNCTION public.get_custom_pick_combination(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER
)
RETURNS JSONB
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    combination_record RECORD;
    auth_picks JSONB;
    anon_picks JSONB;
BEGIN
    -- Get the combination record
    SELECT * INTO combination_record
    FROM public.user_custom_pick_combinations
    WHERE user_id = target_user_id
      AND season = target_season
      AND week = target_week;
    
    IF NOT FOUND THEN
        RETURN JSONB_BUILD_OBJECT(
            'has_custom_combination', false,
            'message', 'No custom combination found'
        );
    END IF;
    
    -- Get authenticated picks with game details and combination status
    SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
            'pick_id', p.id,
            'selected_team', p.selected_team,
            'original_is_lock', p.is_lock,
            'combination_is_lock', COALESCE(p.combination_is_lock, p.is_lock),
            'show_in_combination', p.show_in_combination,
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
        ) ORDER BY p.show_in_combination DESC, p.combination_is_lock DESC NULLS LAST, g.game_time
    ) INTO auth_picks
    FROM public.picks p
    JOIN public.games g ON p.game_id = g.id
    WHERE p.user_id = target_user_id 
      AND p.season = target_season 
      AND p.week = target_week
      AND p.submitted_at IS NOT NULL;
    
    -- Get anonymous picks with game details and combination status
    SELECT JSONB_AGG(
        JSONB_BUILD_OBJECT(
            'pick_id', ap.id,
            'selected_team', ap.selected_team,
            'original_is_lock', ap.is_lock,
            'combination_is_lock', COALESCE(ap.combination_is_lock, ap.is_lock),
            'show_in_combination', ap.show_in_combination,
            'points_earned', COALESCE(ap.points_earned, 0),
            'result', 'pending',
            'source_email', ap.email,
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
        ) ORDER BY ap.show_in_combination DESC, ap.combination_is_lock DESC NULLS LAST, g.game_time
    ) INTO anon_picks
    FROM public.anonymous_picks ap
    JOIN public.games g ON ap.game_id = g.id
    WHERE ap.assigned_user_id = target_user_id 
      AND ap.season = target_season 
      AND ap.week = target_week
      AND ap.show_on_leaderboard = true
      AND ap.validation_status IN ('auto_validated', 'manually_validated');
    
    RETURN JSONB_BUILD_OBJECT(
        'has_custom_combination', true,
        'combination_info', ROW_TO_JSON(combination_record),
        'authenticated_picks', COALESCE(auth_picks, '[]'::jsonb),
        'anonymous_picks', COALESCE(anon_picks, '[]'::jsonb)
    );
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_custom_pick_combinations TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_custom_pick_combination(UUID, INTEGER, INTEGER, JSONB, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_custom_pick_combination(UUID, INTEGER, INTEGER) TO authenticated;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_picks_combination_visibility ON public.picks(user_id, season, week, show_in_combination);
CREATE INDEX IF NOT EXISTS idx_anonymous_picks_combination_visibility ON public.anonymous_picks(assigned_user_id, season, week, show_in_combination);
CREATE INDEX IF NOT EXISTS idx_custom_combinations_user_season_week ON public.user_custom_pick_combinations(user_id, season, week);

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 122 COMPLETED - Individual pick visibility controls!';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 NEW FEATURES:';
    RAISE NOTICE '• Individual pick visibility controls on both tables';
    RAISE NOTICE '• Custom pick combination management';
    RAISE NOTICE '• Override lock pick selection for combinations';
    RAISE NOTICE '• Admin tracking and reasoning for all changes';
    RAISE NOTICE '• Functions: create_custom_pick_combination(), get_custom_pick_combination()';
    RAISE NOTICE '';
    RAISE NOTICE '📝 Admins can now create custom 6-pick combinations from any pick sets!';
END;
$$;