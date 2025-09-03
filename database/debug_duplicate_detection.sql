-- Debug script to understand why duplicate detection isn't working
-- Check the actual data structure and see what's happening

-- First, let's see Jimmy Nummy's actual picks
SELECT 'JIMMY NUMMY AUTHENTICATED PICKS' as debug_section;
SELECT 
    p.user_id,
    u.display_name,
    p.season,
    p.week,
    p.selected_team,
    p.is_lock,
    p.result,
    p.points_earned,
    'authenticated' as pick_type
FROM public.picks p
JOIN public.users u ON p.user_id = u.id
WHERE u.display_name ILIKE '%jimmy%'
  AND p.season = 2025
ORDER BY p.week, p.is_lock DESC;

SELECT 'JIMMY NUMMY ANONYMOUS PICKS' as debug_section;
SELECT 
    ap.assigned_user_id as user_id,
    u.display_name,
    ap.season,
    ap.week,
    ap.selected_team,
    ap.is_lock,
    ap.show_on_leaderboard,
    ap.validation_status,
    'anonymous' as pick_type
FROM public.anonymous_picks ap
JOIN public.users u ON ap.assigned_user_id = u.id
WHERE u.display_name ILIKE '%jimmy%'
  AND ap.season = 2025
ORDER BY ap.week, ap.is_lock DESC;

-- Test our view logic step by step
SELECT 'TESTING VIEW LOGIC - STEP 1: user_pick_analysis' as debug_section;
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
    WHERE u.display_name ILIKE '%jimmy%' AND p.season = 2025
    
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
    WHERE u.display_name ILIKE '%jimmy%' AND ap.season = 2025 AND ap.show_on_leaderboard = true
)
SELECT * FROM user_pick_analysis ORDER BY week, pick_source;

SELECT 'TESTING VIEW LOGIC - STEP 2: duplicate_scenarios' as debug_section;
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
    WHERE u.display_name ILIKE '%jimmy%' AND p.season = 2025
    
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
    WHERE u.display_name ILIKE '%jimmy%' AND ap.season = 2025 AND ap.show_on_leaderboard = true
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
SELECT * FROM duplicate_scenarios ORDER BY week;

-- Check what the view actually returns
SELECT 'ACTUAL VIEW RESULTS' as debug_section;
SELECT * FROM public.duplicate_picks_admin_view 
WHERE display_name ILIKE '%jimmy%' 
ORDER BY week;

-- Check if anonymous picks have assigned_user_id and show_on_leaderboard = true
SELECT 'ANONYMOUS PICKS ANALYSIS' as debug_section;
SELECT 
    COUNT(*) as total_anonymous_picks,
    COUNT(CASE WHEN assigned_user_id IS NOT NULL THEN 1 END) as assigned_picks,
    COUNT(CASE WHEN show_on_leaderboard = true THEN 1 END) as leaderboard_picks,
    COUNT(CASE WHEN assigned_user_id IS NOT NULL AND show_on_leaderboard = true THEN 1 END) as assigned_and_leaderboard
FROM public.anonymous_picks 
WHERE season = 2025;

-- Get season leaderboard data to see what's actually being counted
SELECT 'SEASON LEADERBOARD DATA' as debug_section;
SELECT 
    user_id,
    display_name,
    total_picks,
    total_wins,
    total_losses,
    total_pushes,
    pick_source
FROM public.season_leaderboard 
WHERE season = 2025 
  AND display_name IN ('Jimmy Nummy', 'Walker Harlow', 'Clark T')
ORDER BY display_name;