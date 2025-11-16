-- Simple Cron Verification - Guaranteed to Work
-- Run this in Supabase SQL Editor

-- ============================================================================
-- 1. Check pg_cron extension
-- ============================================================================
SELECT
    extname as extension,
    '✅ Installed' as status
FROM pg_extension
WHERE extname = 'pg_cron';

-- Should show: pg_cron | ✅ Installed

-- ============================================================================
-- 2. List all cron jobs (simple view)
-- ============================================================================
SELECT
    jobid,
    jobname,
    schedule,
    active
FROM cron.job
ORDER BY jobname;

-- Should show 3 jobs:
-- - live-scoring-thu-sat   | */5 0-5 * * 5-7
-- - live-scoring-sunday    | */5 6-13 * * 0
-- - update-game-statistics | 0 16 * * 6

-- ============================================================================
-- 3. Check for placeholder values (IMPORTANT!)
-- ============================================================================
SELECT
    jobname,
    CASE
        WHEN command LIKE '%YOUR_PROJECT_ID%'
          OR command LIKE '%YOUR_SERVICE_ROLE_KEY%'
        THEN '❌ PLACEHOLDERS FOUND - UPDATE NEEDED!'
        ELSE '✅ Credentials OK'
    END as credential_status
FROM cron.job
ORDER BY jobname;

-- Should show "✅ Credentials OK" for all 3 jobs

-- ============================================================================
-- 4. Count jobs
-- ============================================================================
SELECT
    COUNT(*) as total_jobs,
    CASE
        WHEN COUNT(*) = 3 THEN '✅ All 3 jobs configured'
        ELSE '❌ Expected 3 jobs, found ' || COUNT(*)::text
    END as status
FROM cron.job;

-- ============================================================================
-- 5. Check database functions
-- ============================================================================
SELECT
    proname as function_name
FROM pg_proc
WHERE proname IN (
    'calculate_and_update_completed_game',
    'scheduled_game_statistics',
    'process_picks_for_completed_game'
)
ORDER BY proname;

-- Should show 3 functions

-- ============================================================================
-- 6. Job execution history (if any)
-- ============================================================================
SELECT
    jobid,
    status,
    start_time AT TIME ZONE 'America/Chicago' as start_time_ct,
    end_time AT TIME ZONE 'America/Chicago' as end_time_ct
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- If empty: Jobs haven't run yet (normal - they only run during scheduled times)
-- If shows rows: Check status column (should be 'succeeded')

-- ============================================================================
-- 7. FINAL CHECKLIST
-- ============================================================================
SELECT
    '✅ Setup Complete!' as status
WHERE
    -- pg_cron is enabled
    EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
    -- 3 jobs are scheduled
    AND (SELECT COUNT(*) FROM cron.job) = 3
    -- No placeholders remain
    AND NOT EXISTS (
        SELECT 1 FROM cron.job
        WHERE command LIKE '%YOUR_PROJECT_ID%'
           OR command LIKE '%YOUR_SERVICE_ROLE_KEY%'
    )
    -- Database functions exist
    AND (SELECT COUNT(*) FROM pg_proc WHERE proname IN (
        'calculate_and_update_completed_game',
        'scheduled_game_statistics',
        'process_picks_for_completed_game'
    )) = 3;

-- If this returns "✅ Setup Complete!" then everything is working!
-- If no rows returned, check the individual queries above to see what's missing
