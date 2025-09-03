-- Migration 112: Add Database Constraints to Prevent Duplicate Picks
-- 
-- PURPOSE: Prevent users from having duplicate picks that could cause leaderboard issues
-- CONTEXT: After fixing the leaderboard calculation, we need safeguards against future duplicates

DO $$
BEGIN
    RAISE NOTICE '🔧 Migration 112: Adding duplicate prevention constraints';
    RAISE NOTICE '===========================================================';
END;
$$;

-- Ensure no user can have more than 6 picks per week (1 lock + 5 regular)
-- This constraint will prevent the duplicate issue at the source
CREATE OR REPLACE FUNCTION check_user_picks_limit() 
RETURNS TRIGGER AS $$
DECLARE
    pick_count INTEGER;
    lock_count INTEGER;
BEGIN
    -- Count current picks for this user/week/season
    SELECT COUNT(*), COUNT(CASE WHEN is_lock THEN 1 END)
    INTO pick_count, lock_count
    FROM public.picks 
    WHERE user_id = NEW.user_id 
      AND week = NEW.week 
      AND season = NEW.season;
    
    -- Allow updates to existing picks
    IF TG_OP = 'UPDATE' THEN
        RETURN NEW;
    END IF;
    
    -- Check pick limits for new picks
    IF pick_count >= 6 THEN
        RAISE EXCEPTION 'User cannot have more than 6 picks per week (current: %)', pick_count;
    END IF;
    
    -- Check lock pick limits
    IF NEW.is_lock = true AND lock_count >= 1 THEN
        RAISE EXCEPTION 'User cannot have more than 1 lock pick per week (current: %)', lock_count;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce pick limits
DROP TRIGGER IF EXISTS enforce_picks_limit ON public.picks;
CREATE TRIGGER enforce_picks_limit
    BEFORE INSERT ON public.picks
    FOR EACH ROW
    EXECUTE FUNCTION check_user_picks_limit();

-- Similar constraint for anonymous picks
CREATE OR REPLACE FUNCTION check_anonymous_picks_limit() 
RETURNS TRIGGER AS $$
DECLARE
    pick_count INTEGER;
    lock_count INTEGER;
BEGIN
    -- Only check if this pick will show on leaderboard
    IF NEW.show_on_leaderboard != true OR NEW.assigned_user_id IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Count current anonymous picks for this user/week/season that show on leaderboard
    SELECT COUNT(*), COUNT(CASE WHEN is_lock THEN 1 END)
    INTO pick_count, lock_count
    FROM public.anonymous_picks 
    WHERE assigned_user_id = NEW.assigned_user_id 
      AND week = NEW.week 
      AND season = NEW.season
      AND show_on_leaderboard = true;
    
    -- Allow updates to existing picks
    IF TG_OP = 'UPDATE' THEN
        RETURN NEW;
    END IF;
    
    -- Check pick limits for new anonymous picks
    IF pick_count >= 6 THEN
        RAISE EXCEPTION 'User cannot have more than 6 anonymous picks per week showing on leaderboard (current: %)', pick_count;
    END IF;
    
    -- Check lock pick limits
    IF NEW.is_lock = true AND lock_count >= 1 THEN
        RAISE EXCEPTION 'User cannot have more than 1 anonymous lock pick per week showing on leaderboard (current: %)', lock_count;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce anonymous pick limits
DROP TRIGGER IF EXISTS enforce_anonymous_picks_limit ON public.anonymous_picks;
CREATE TRIGGER enforce_anonymous_picks_limit
    BEFORE INSERT OR UPDATE ON public.anonymous_picks
    FOR EACH ROW
    EXECUTE FUNCTION check_anonymous_picks_limit();

-- Add a function to detect and report any existing duplicates
CREATE OR REPLACE FUNCTION detect_pick_duplicates(target_season INTEGER DEFAULT 2025)
RETURNS TABLE(
    user_id UUID,
    display_name TEXT,
    week INTEGER,
    authenticated_picks BIGINT,
    anonymous_picks BIGINT,
    total_picks BIGINT,
    issue_type TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH user_pick_counts AS (
        -- Authenticated picks count
        SELECT 
            p.user_id,
            u.display_name,
            p.week,
            COUNT(*) as auth_picks,
            0::BIGINT as anon_picks
        FROM public.picks p
        JOIN public.users u ON p.user_id = u.id
        WHERE p.season = target_season
        GROUP BY p.user_id, u.display_name, p.week
        
        UNION ALL
        
        -- Anonymous picks count (only those showing on leaderboard)
        SELECT 
            ap.assigned_user_id as user_id,
            u.display_name,
            ap.week,
            0::BIGINT as auth_picks,
            COUNT(*) as anon_picks
        FROM public.anonymous_picks ap
        JOIN public.users u ON ap.assigned_user_id = u.id
        WHERE ap.season = target_season 
          AND ap.show_on_leaderboard = true
          AND ap.assigned_user_id IS NOT NULL
        GROUP BY ap.assigned_user_id, u.display_name, ap.week
    ),
    combined_counts AS (
        SELECT 
            user_id,
            display_name,
            week,
            SUM(auth_picks) as total_auth_picks,
            SUM(anon_picks) as total_anon_picks,
            SUM(auth_picks + anon_picks) as total_all_picks
        FROM user_pick_counts
        GROUP BY user_id, display_name, week
    )
    SELECT 
        cc.user_id,
        cc.display_name,
        cc.week,
        cc.total_auth_picks,
        cc.total_anon_picks,
        cc.total_all_picks,
        CASE 
            WHEN cc.total_auth_picks > 6 THEN 'Too many authenticated picks'
            WHEN cc.total_anon_picks > 6 THEN 'Too many anonymous picks'
            WHEN cc.total_auth_picks > 0 AND cc.total_anon_picks > 0 THEN 'Both authenticated and anonymous picks'
            WHEN cc.total_all_picks > 6 THEN 'Total picks exceed limit'
            ELSE 'Unknown issue'
        END as issue_type
    FROM combined_counts cc
    WHERE cc.total_all_picks > 6 
       OR (cc.total_auth_picks > 0 AND cc.total_anon_picks > 0)
    ORDER BY cc.user_id, cc.week;
END;
$$;

-- Run duplicate detection to see if there are any remaining issues
DO $$
DECLARE
    duplicate_record RECORD;
    duplicate_count INTEGER := 0;
BEGIN
    RAISE NOTICE '🔍 Checking for remaining duplicate picks after migration 111...';
    
    FOR duplicate_record IN 
        SELECT * FROM detect_pick_duplicates(2025)
    LOOP
        duplicate_count := duplicate_count + 1;
        RAISE NOTICE '⚠️ Issue found: User % (%) Week % - Auth: %, Anon: %, Total: % - %',
            duplicate_record.display_name,
            duplicate_record.user_id,
            duplicate_record.week,
            duplicate_record.authenticated_picks,
            duplicate_record.anonymous_picks,
            duplicate_record.total_picks,
            duplicate_record.issue_type;
    END LOOP;
    
    IF duplicate_count = 0 THEN
        RAISE NOTICE '✅ No duplicate pick issues detected!';
    ELSE
        RAISE NOTICE '⚠️ Found % duplicate pick issues that may need manual resolution', duplicate_count;
    END IF;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_user_picks_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION check_anonymous_picks_limit() TO authenticated;
GRANT EXECUTE ON FUNCTION detect_pick_duplicates(INTEGER) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION check_user_picks_limit() IS 'Prevents users from having more than 6 picks per week (including 1 lock max)';
COMMENT ON FUNCTION check_anonymous_picks_limit() IS 'Prevents users from having more than 6 anonymous picks per week showing on leaderboard';
COMMENT ON FUNCTION detect_pick_duplicates(INTEGER) IS 'Detects and reports duplicate pick scenarios that could affect leaderboards';

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 112 COMPLETED - Duplicate prevention constraints added!';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 NEW SAFEGUARDS:';
    RAISE NOTICE '• Database triggers prevent >6 picks per user per week';
    RAISE NOTICE '• Database triggers prevent >1 lock pick per user per week';  
    RAISE NOTICE '• Separate limits for authenticated and anonymous picks';
    RAISE NOTICE '• Detection function to identify any remaining issues';
    RAISE NOTICE '';
    RAISE NOTICE '🛠️ The database now enforces pick limits to prevent future duplicates.';
END;
$$;