-- Fix ATS logic in database triggers and correct Nebraska game results
-- The triggers contain hardcoded ATS logic that is also incorrect

-- Step 1: Fix the ATS calculation logic in trigger functions
-- The current logic: (g.home_score + g.spread) > g.away_score is WRONG
-- Correct logic: For home favorite (negative spread), home team must win by MORE than |spread|

CREATE OR REPLACE FUNCTION public.calculate_ats_result(
    selected_team TEXT,
    home_team TEXT,
    away_team TEXT,
    home_score INTEGER,
    away_score INTEGER,
    spread DECIMAL
) RETURNS pick_result AS $$
DECLARE
    actual_margin INTEGER;
    picked_home BOOLEAN;
    result pick_result;
BEGIN
    actual_margin := home_score - away_score;
    picked_home := (selected_team = home_team);
    
    IF picked_home THEN
        -- User picked home team - home team must cover the spread
        -- For home favorite (negative spread): actualMargin must be greater than |spread|
        IF actual_margin > ABS(spread) THEN
            result := 'win';
        ELSIF actual_margin = ABS(spread) THEN
            result := 'push';
        ELSE
            result := 'loss';
        END IF;
    ELSE
        -- User picked away team - away team must cover the spread
        IF spread < 0 THEN
            -- Home team is favored, away team is underdog
            -- Away team covers if they lose by less than the spread or win outright
            IF actual_margin < ABS(spread) THEN
                result := 'win';
            ELSIF actual_margin = ABS(spread) THEN
                result := 'push';
            ELSE
                result := 'loss';
            END IF;
        ELSE
            -- Away team is favored, home team is underdog
            -- Away team must win by more than the spread
            IF ABS(actual_margin) > spread THEN
                result := 'win';
            ELSIF ABS(actual_margin) = spread THEN
                result := 'push';
            ELSE
                result := 'loss';
            END IF;
        END IF;
    END IF;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create function to calculate points with correct logic
CREATE OR REPLACE FUNCTION public.calculate_ats_points(
    ats_result pick_result,
    is_lock BOOLEAN,
    actual_margin INTEGER,
    spread DECIMAL,
    selected_team TEXT,
    home_team TEXT
) RETURNS INTEGER AS $$
DECLARE
    base_points INTEGER;
    bonus_points INTEGER;
    cover_margin DECIMAL;
    picked_home BOOLEAN;
BEGIN
    -- Base points
    IF ats_result = 'win' THEN
        base_points := 20;
    ELSIF ats_result = 'push' THEN
        base_points := 10;
    ELSE
        base_points := 0;
    END IF;
    
    -- Calculate bonus points for wins
    bonus_points := 0;
    IF ats_result = 'win' THEN
        picked_home := (selected_team = home_team);
        
        IF picked_home THEN
            cover_margin := actual_margin - ABS(spread);
        ELSE
            IF spread < 0 THEN
                cover_margin := ABS(spread) - actual_margin;
            ELSE
                cover_margin := ABS(actual_margin) - spread;
            END IF;
        END IF;
        
        IF cover_margin >= 29 THEN
            bonus_points := 5;
        ELSIF cover_margin >= 20 THEN
            bonus_points := 3;
        ELSIF cover_margin >= 11 THEN
            bonus_points := 1;
        END IF;
        
        -- Apply lock multiplier
        IF is_lock THEN
            bonus_points := bonus_points * 2;
        END IF;
    END IF;
    
    RETURN base_points + bonus_points;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Update the trigger functions to use correct ATS logic
CREATE OR REPLACE FUNCTION public.handle_anonymous_pick_assignment()
RETURNS TRIGGER AS $$
DECLARE
    pick_record RECORD;
    ats_result pick_result;
    points_earned INTEGER;
BEGIN
    -- Only process if assigned_user_id was changed (null to not-null or different user)
    IF (OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id) AND NEW.assigned_user_id IS NOT NULL THEN
        
        -- Get game details and calculate correct ATS result
        SELECT 
            NEW.assigned_user_id as user_id,
            NEW.game_id,
            NEW.week,
            NEW.season,
            NEW.selected_team,
            NEW.is_lock,
            g.home_team,
            g.away_team,
            g.home_score,
            g.away_score,
            g.spread,
            g.status
        INTO pick_record
        FROM public.games g 
        WHERE g.id = NEW.game_id;
        
        -- Calculate ATS result using correct logic
        IF pick_record.status = 'completed' AND pick_record.home_score IS NOT NULL AND pick_record.away_score IS NOT NULL THEN
            ats_result := public.calculate_ats_result(
                NEW.selected_team,
                pick_record.home_team,
                pick_record.away_team,
                pick_record.home_score,
                pick_record.away_score,
                pick_record.spread
            );
            
            points_earned := public.calculate_ats_points(
                ats_result,
                NEW.is_lock,
                pick_record.home_score - pick_record.away_score,
                pick_record.spread,
                NEW.selected_team,
                pick_record.home_team
            );
        ELSE
            ats_result := NULL;
            points_earned := NULL;
        END IF;
        
        -- Trigger the leaderboard recalculation functions
        PERFORM public.recalculate_weekly_leaderboard_for_user(
            pick_record.user_id, 
            pick_record.week, 
            pick_record.season
        );
        
        PERFORM public.recalculate_season_leaderboard_for_user(
            pick_record.user_id, 
            pick_record.season
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Update helper functions to use correct ATS logic
CREATE OR REPLACE FUNCTION public.recalculate_weekly_leaderboard_for_user(
    p_user_id UUID, 
    p_week INTEGER, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_stats RECORD;
BEGIN
    -- Calculate combined stats from regular picks and assigned anonymous picks
    SELECT 
        COUNT(*) as picks_made,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_stats
    FROM (
        -- Regular picks
        SELECT result, is_lock, points_earned
        FROM public.picks 
        WHERE user_id = p_user_id AND week = p_week AND season = p_season
        
        UNION ALL
        
        -- Assigned anonymous picks (with CORRECT ATS calculation)
        SELECT 
            CASE 
                WHEN g.status = 'completed' AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL THEN
                    public.calculate_ats_result(ap.selected_team, g.home_team, g.away_team, g.home_score, g.away_score, g.spread)
                ELSE NULL::pick_result
            END as result,
            ap.is_lock,
            CASE 
                WHEN g.status = 'completed' AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL THEN
                    public.calculate_ats_points(
                        public.calculate_ats_result(ap.selected_team, g.home_team, g.away_team, g.home_score, g.away_score, g.spread),
                        ap.is_lock,
                        g.home_score - g.away_score,
                        g.spread,
                        ap.selected_team,
                        g.home_team
                    )
                ELSE NULL::INTEGER
            END as points_earned
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = p_user_id AND ap.week = p_week AND ap.season = p_season
    ) combined_picks;
    
    -- Upsert the weekly leaderboard entry
    INSERT INTO public.weekly_leaderboard (
        user_id, display_name, week, season, picks_made, wins, losses, pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified
    ) VALUES (
        p_user_id,
        (SELECT display_name FROM public.users WHERE id = p_user_id),
        p_week,
        p_season,
        user_stats.picks_made,
        user_stats.wins,
        user_stats.losses,
        user_stats.pushes,
        user_stats.lock_wins,
        user_stats.lock_losses,
        user_stats.total_points,
        COALESCE((SELECT status FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), 'NotPaid'),
        COALESCE((SELECT (status = 'Paid' AND is_matched = TRUE) FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), FALSE)
    )
    ON CONFLICT (user_id, week, season) 
    DO UPDATE SET
        picks_made = EXCLUDED.picks_made,
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        pushes = EXCLUDED.pushes,
        lock_wins = EXCLUDED.lock_wins,
        lock_losses = EXCLUDED.lock_losses,
        total_points = EXCLUDED.total_points,
        updated_at = NOW();
    
    -- Recalculate rankings for this week/season
    UPDATE public.weekly_leaderboard 
    SET weekly_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.weekly_leaderboard
        WHERE week = p_week AND season = p_season
    ) subq
    WHERE public.weekly_leaderboard.id = subq.id
        AND public.weekly_leaderboard.week = p_week
        AND public.weekly_leaderboard.season = p_season;
END;
$$ LANGUAGE plpgsql;

-- Same fix for season leaderboard helper
CREATE OR REPLACE FUNCTION public.recalculate_season_leaderboard_for_user(
    p_user_id UUID, 
    p_season INTEGER
) RETURNS VOID AS $$
DECLARE
    user_stats RECORD;
BEGIN
    -- Calculate combined season stats from regular picks and assigned anonymous picks
    SELECT 
        COUNT(*) as total_picks,
        COUNT(CASE WHEN result = 'win' THEN 1 END) as total_wins,
        COUNT(CASE WHEN result = 'loss' THEN 1 END) as total_losses,
        COUNT(CASE WHEN result = 'push' THEN 1 END) as total_pushes,
        COUNT(CASE WHEN result = 'win' AND is_lock THEN 1 END) as lock_wins,
        COUNT(CASE WHEN result = 'loss' AND is_lock THEN 1 END) as lock_losses,
        COALESCE(SUM(points_earned), 0) as total_points
    INTO user_stats
    FROM (
        -- Regular picks
        SELECT result, is_lock, points_earned
        FROM public.picks 
        WHERE user_id = p_user_id AND season = p_season
        
        UNION ALL
        
        -- Assigned anonymous picks (with CORRECT ATS calculation)
        SELECT 
            CASE 
                WHEN g.status = 'completed' AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL THEN
                    public.calculate_ats_result(ap.selected_team, g.home_team, g.away_team, g.home_score, g.away_score, g.spread)
                ELSE NULL::pick_result
            END as result,
            ap.is_lock,
            CASE 
                WHEN g.status = 'completed' AND g.home_score IS NOT NULL AND g.away_score IS NOT NULL THEN
                    public.calculate_ats_points(
                        public.calculate_ats_result(ap.selected_team, g.home_team, g.away_team, g.home_score, g.away_score, g.spread),
                        ap.is_lock,
                        g.home_score - g.away_score,
                        g.spread,
                        ap.selected_team,
                        g.home_team
                    )
                ELSE NULL::INTEGER
            END as points_earned
        FROM public.anonymous_picks ap
        JOIN public.games g ON ap.game_id = g.id
        WHERE ap.assigned_user_id = p_user_id AND ap.season = p_season
    ) combined_picks;
    
    -- Upsert the season leaderboard entry
    INSERT INTO public.season_leaderboard (
        user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
        lock_wins, lock_losses, total_points, payment_status, is_verified
    ) VALUES (
        p_user_id,
        (SELECT display_name FROM public.users WHERE id = p_user_id),
        p_season,
        user_stats.total_picks,
        user_stats.total_wins,
        user_stats.total_losses,
        user_stats.total_pushes,
        user_stats.lock_wins,
        user_stats.lock_losses,
        user_stats.total_points,
        COALESCE((SELECT status FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), 'NotPaid'),
        COALESCE((SELECT (status = 'Paid' AND is_matched = TRUE) FROM public.leaguesafe_payments WHERE user_id = p_user_id AND season = p_season), FALSE)
    )
    ON CONFLICT (user_id, season) 
    DO UPDATE SET
        total_picks = EXCLUDED.total_picks,
        total_wins = EXCLUDED.total_wins,
        total_losses = EXCLUDED.total_losses,
        total_pushes = EXCLUDED.total_pushes,
        lock_wins = EXCLUDED.lock_wins,
        lock_losses = EXCLUDED.lock_losses,
        total_points = EXCLUDED.total_points,
        updated_at = NOW();
    
    -- Recalculate rankings for this season
    UPDATE public.season_leaderboard 
    SET season_rank = subq.rank
    FROM (
        SELECT id, RANK() OVER (ORDER BY total_points DESC) as rank
        FROM public.season_leaderboard
        WHERE season = p_season
    ) subq
    WHERE public.season_leaderboard.id = subq.id
        AND public.season_leaderboard.season = p_season;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Now fix the Nebraska game with correct ATS logic
-- Update the games table with correct ATS winner
UPDATE games 
SET 
  winner_against_spread = 'CINCINNATI',
  status = 'completed'
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Step 6: Temporarily disable triggers to prevent override
ALTER TABLE picks DISABLE TRIGGER update_weekly_leaderboard_trigger;
ALTER TABLE picks DISABLE TRIGGER update_season_leaderboard_trigger;

-- Step 7: Fix Nebraska picks with correct results
-- Nebraska picks should be LOSSES (Nebraska didn't cover 6.5 spread)
UPDATE picks 
SET 
  result = 'loss',
  points_earned = 0,
  updated_at = NOW()
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'NEBRASKA';

-- Cincinnati picks should be WINS (Cincinnati covered as +6.5 underdog)
-- Cover margin = 6.5 - 3 = 3.5 (no bonus points)
UPDATE picks 
SET 
  result = 'win',
  points_earned = CASE 
    WHEN is_lock = true THEN 20  -- Base points only, no bonus
    ELSE 20
  END,
  updated_at = NOW()
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
  AND selected_team = 'CINCINNATI';

-- Step 8: Re-enable triggers
ALTER TABLE picks ENABLE TRIGGER update_weekly_leaderboard_trigger;
ALTER TABLE picks ENABLE TRIGGER update_season_leaderboard_trigger;

-- Step 9: Force trigger the leaderboard recalculation for all affected users
DO $$
DECLARE
    affected_user RECORD;
BEGIN
    -- Get all users who had picks in the Nebraska game
    FOR affected_user IN 
        SELECT DISTINCT user_id, week, season 
        FROM picks 
        WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
    LOOP
        -- Trigger recalculation for each user
        UPDATE picks 
        SET updated_at = NOW() 
        WHERE user_id = affected_user.user_id 
          AND week = affected_user.week 
          AND season = affected_user.season
          AND game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
        LIMIT 1;
    END LOOP;
END;
$$;

-- Step 10: Verification queries
SELECT 
  'Nebraska vs Cincinnati ATS Fix Results' as description,
  away_team || ' @ ' || home_team as matchup,
  away_score || ' - ' || home_score as final_score,
  'Nebraska -' || ABS(spread) as betting_line,
  winner_against_spread as ats_winner,
  status,
  CASE 
    WHEN winner_against_spread = 'CINCINNATI' THEN '✅ Cincinnati correctly set as ATS winner'
    ELSE '❌ ATS winner still incorrect'
  END as fix_status
FROM games 
WHERE id = '81ae6301-304f-4860-a890-ac3aacf556ef';

-- Show updated pick results
SELECT 
  selected_team,
  COUNT(*) as pick_count,
  result,
  points_earned,
  CASE 
    WHEN selected_team = 'CINCINNATI' AND result = 'win' THEN '✅ Correct - Cincinnati covered'
    WHEN selected_team = 'NEBRASKA' AND result = 'loss' THEN '✅ Correct - Nebraska failed to cover'
    ELSE '❌ Still incorrect'
  END as validation
FROM picks 
WHERE game_id = '81ae6301-304f-4860-a890-ac3aacf556ef'
GROUP BY selected_team, result, points_earned
ORDER BY selected_team, result;