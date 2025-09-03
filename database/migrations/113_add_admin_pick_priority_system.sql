-- Migration 113: Add Admin Pick Priority Management System
-- 
-- PURPOSE: Allow admins to manually choose which pick set to use for users with both authenticated and anonymous picks
-- DEFAULT: Use authenticated picks unless admin explicitly chooses otherwise

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 113: Adding admin pick priority management system';
    RAISE NOTICE '================================================================';
END;
$$;

-- Create table to store admin pick preferences
CREATE TABLE IF NOT EXISTS public.user_pick_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    week INTEGER, -- NULL means applies to entire season
    preferred_source VARCHAR(20) NOT NULL CHECK (preferred_source IN ('authenticated', 'anonymous')),
    set_by_admin UUID REFERENCES public.users(id), -- Which admin made this decision
    reasoning TEXT, -- Optional admin notes about why this choice was made
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint: one preference per user per season (or week)
    UNIQUE(user_id, season, week)
);

-- Add RLS policies
ALTER TABLE public.user_pick_preferences ENABLE ROW LEVEL SECURITY;

-- Only admins can manage pick preferences
CREATE POLICY "Admin full access to pick preferences" ON public.user_pick_preferences
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
    );

-- Create indexes for performance
CREATE INDEX idx_user_pick_preferences_user_season ON public.user_pick_preferences(user_id, season);
CREATE INDEX idx_user_pick_preferences_season_week ON public.user_pick_preferences(season, week);

-- Create view to show users with duplicate pick scenarios
CREATE OR REPLACE VIEW public.duplicate_picks_admin_view AS
WITH user_pick_analysis AS (
    SELECT DISTINCT
        u.id as user_id,
        u.display_name,
        p.season,
        p.week,
        'authenticated' as pick_source,
        COUNT(*) OVER (PARTITION BY u.id, p.season, p.week) as pick_count,
        COUNT(CASE WHEN p.is_lock THEN 1 END) OVER (PARTITION BY u.id, p.season, p.week) as lock_count
    FROM public.users u
    JOIN public.picks p ON u.id = p.user_id
    
    UNION ALL
    
    SELECT DISTINCT
        u.id as user_id,
        u.display_name,
        ap.season,
        ap.week,
        'anonymous' as pick_source,
        COUNT(*) OVER (PARTITION BY u.id, ap.season, ap.week) as pick_count,
        COUNT(CASE WHEN ap.is_lock THEN 1 END) OVER (PARTITION BY u.id, ap.season, ap.week) as lock_count
    FROM public.users u
    JOIN public.anonymous_picks ap ON u.id = ap.assigned_user_id
    WHERE ap.show_on_leaderboard = true
),
duplicate_scenarios AS (
    SELECT 
        user_id,
        display_name,
        season,
        week,
        MAX(CASE WHEN pick_source = 'authenticated' THEN pick_count ELSE 0 END) as authenticated_picks,
        MAX(CASE WHEN pick_source = 'authenticated' THEN lock_count ELSE 0 END) as authenticated_locks,
        MAX(CASE WHEN pick_source = 'anonymous' THEN pick_count ELSE 0 END) as anonymous_picks,
        MAX(CASE WHEN pick_source = 'anonymous' THEN lock_count ELSE 0 END) as anonymous_locks
    FROM user_pick_analysis
    GROUP BY user_id, display_name, season, week
    HAVING 
        MAX(CASE WHEN pick_source = 'authenticated' THEN pick_count ELSE 0 END) > 0
        AND MAX(CASE WHEN pick_source = 'anonymous' THEN pick_count ELSE 0 END) > 0
)
SELECT 
    ds.*,
    upp.preferred_source as admin_preference,
    upp.reasoning as admin_reasoning,
    upp.set_by_admin,
    admin_user.display_name as admin_name,
    upp.created_at as preference_set_at,
    CASE 
        WHEN upp.preferred_source IS NOT NULL THEN upp.preferred_source
        ELSE 'authenticated' -- Default to authenticated picks
    END as effective_source,
    CASE 
        WHEN upp.preferred_source IS NOT NULL THEN 'Admin Choice'
        ELSE 'Default (Authenticated)'
    END as source_reason
FROM duplicate_scenarios ds
LEFT JOIN public.user_pick_preferences upp ON 
    ds.user_id = upp.user_id 
    AND ds.season = upp.season 
    AND (upp.week IS NULL OR upp.week = ds.week)
LEFT JOIN public.users admin_user ON upp.set_by_admin = admin_user.id
ORDER BY ds.season, ds.week, ds.display_name;

-- Grant access to admins
GRANT SELECT ON public.duplicate_picks_admin_view TO authenticated;

-- Update the leaderboard functions to respect admin preferences
CREATE OR REPLACE FUNCTION public.get_preferred_pick_source(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER DEFAULT NULL
)
RETURNS VARCHAR(20)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    preferred_source VARCHAR(20);
BEGIN
    -- Check for week-specific preference first
    IF target_week IS NOT NULL THEN
        SELECT upp.preferred_source 
        INTO preferred_source
        FROM public.user_pick_preferences upp
        WHERE upp.user_id = target_user_id 
          AND upp.season = target_season 
          AND upp.week = target_week;
        
        IF FOUND THEN
            RETURN preferred_source;
        END IF;
    END IF;
    
    -- Check for season-wide preference
    SELECT upp.preferred_source 
    INTO preferred_source
    FROM public.user_pick_preferences upp
    WHERE upp.user_id = target_user_id 
      AND upp.season = target_season 
      AND upp.week IS NULL;
    
    IF FOUND THEN
        RETURN preferred_source;
    END IF;
    
    -- Default to authenticated picks
    RETURN 'authenticated';
END;
$$;

-- Update season leaderboard function to use admin preferences
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
    has_authenticated_picks BOOLEAN DEFAULT FALSE;
    has_anonymous_picks BOOLEAN DEFAULT FALSE;
    preferred_source VARCHAR(20);
    final_pick_source VARCHAR(20);
BEGIN
    -- Get user info (display name and payment status)
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
    
    -- Check what pick types this user has
    SELECT COUNT(*) > 0 INTO has_authenticated_picks
    FROM public.picks 
    WHERE user_id = target_user_id AND season = target_season AND result IS NOT NULL;
    
    SELECT COUNT(*) > 0 INTO has_anonymous_picks
    FROM public.anonymous_picks ap
    WHERE ap.assigned_user_id = target_user_id 
      AND ap.season = target_season 
      AND ap.show_on_leaderboard = true;
    
    -- Get admin preference (defaults to 'authenticated')
    preferred_source := public.get_preferred_pick_source(target_user_id, target_season, NULL);
    
    -- Determine which pick source to actually use
    final_pick_source := CASE 
        WHEN has_authenticated_picks AND has_anonymous_picks THEN 
            -- Both exist, use admin preference
            preferred_source
        WHEN has_authenticated_picks THEN 
            'authenticated'
        WHEN has_anonymous_picks THEN 
            'anonymous'
        ELSE 
            'authenticated' -- fallback
    END;
    
    -- Calculate stats based on chosen source
    IF final_pick_source = 'authenticated' AND has_authenticated_picks THEN
        -- Use authenticated picks
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
    ELSE
        -- Use anonymous picks as fallback
        SELECT 
            COUNT(*) as total_picks,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND
                 ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
                THEN 1 END) as wins,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND
                 NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                      (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
                 (g.home_score + g.spread) != g.away_score)
                THEN 1 END) as losses,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND (g.home_score + g.spread) = g.away_score)
                THEN 1 END) as pushes,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND ap.is_lock = true AND
                 ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                  (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)))
                THEN 1 END) as lock_wins,
            COUNT(CASE WHEN 
                (g.status = 'completed' AND ap.is_lock = true AND
                 NOT ((ap.selected_team = g.home_team AND (g.home_score + g.spread) > g.away_score) OR 
                      (ap.selected_team = g.away_team AND (g.away_score - g.spread) > g.home_score)) AND
                 (g.home_score + g.spread) != g.away_score)
                THEN 1 END) as lock_losses,
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
            END), 0) as total_points
        INTO user_stats
        FROM public.anonymous_picks ap
        LEFT JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = target_user_id 
            AND ap.season = target_season 
            AND ap.show_on_leaderboard = true;
        
        final_pick_source := 'anonymous';
    END IF;
    
    -- Insert or update season leaderboard
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified, pick_source
    ) VALUES (
        target_user_id, user_info.display_name, target_season, COALESCE(user_stats.total_picks, 0),
        COALESCE(user_stats.wins, 0), COALESCE(user_stats.losses, 0), COALESCE(user_stats.pushes, 0), 
        COALESCE(user_stats.lock_wins, 0), COALESCE(user_stats.lock_losses, 0), COALESCE(user_stats.total_points, 0),
        user_info.payment_status, user_info.is_verified, final_pick_source
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

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_pick_preferences TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_preferred_pick_source(UUID, INTEGER, INTEGER) TO authenticated;

-- Comments for documentation
COMMENT ON TABLE public.user_pick_preferences IS 'Admin-managed preferences for which pick source to use when users have both authenticated and anonymous picks';
COMMENT ON VIEW public.duplicate_picks_admin_view IS 'Admin view showing users with duplicate pick scenarios and current preferences';
COMMENT ON FUNCTION public.get_preferred_pick_source(UUID, INTEGER, INTEGER) IS 'Gets admin preference for pick source, defaults to authenticated';

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 113 COMPLETED - Admin pick priority system added!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 NEW FEATURES:';
    RAISE NOTICE '• user_pick_preferences table for admin choices';
    RAISE NOTICE '• duplicate_picks_admin_view shows all conflicts';
    RAISE NOTICE '• Default behavior: use authenticated picks';
    RAISE NOTICE '• Admin can override on per-user, per-season, or per-week basis';
    RAISE NOTICE '• Leaderboard functions now respect admin preferences';
    RAISE NOTICE '';
    RAISE NOTICE '🛠️ Next: Create admin UI component to manage these preferences.';
END;
$$;