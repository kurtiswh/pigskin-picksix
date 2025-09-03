-- Migration 128: Temporarily disable leaderboard refresh to test core save functionality
-- 
-- PURPOSE: Disable leaderboard refresh calls until schema issues are resolved

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 128: Temporarily disable leaderboard refresh calls';
    RAISE NOTICE '================================================================';
END;
$$;

-- Update the create_custom_pick_combination function to disable leaderboard refresh
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
    
    -- Leaderboard refresh temporarily disabled
    -- PERFORM public.refresh_all_leaderboards(target_season);
    
    RETURN JSONB_BUILD_OBJECT(
        'success', true,
        'total_picks_selected', total_picks,
        'lock_pick_id', lock_pick_id_result,
        'lock_pick_source', lock_pick_source_result,
        'affected_auth_picks', affected_auth_picks,
        'affected_anon_picks', affected_anon_picks,
        'message', 'Custom pick combination created successfully (leaderboard refresh disabled temporarily)'
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
    RAISE NOTICE '✅ Migration 128 COMPLETED - Leaderboard refresh temporarily disabled!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 CHANGES:';
    RAISE NOTICE '• Disabled refresh_all_leaderboards() call';
    RAISE NOTICE '• Core save functionality should work now';
    RAISE NOTICE '• Leaderboard updates can be re-enabled after schema alignment';
    RAISE NOTICE '';
    RAISE NOTICE '💾 Try saving your custom combination now!';
END;
$$;