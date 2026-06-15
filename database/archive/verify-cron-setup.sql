-- Verification SQL for Auto-Update Setup
-- Run this in Supabase SQL Editor to verify everything is working

-- ============================================================================
-- 1. Check pg_cron extension
-- ============================================================================
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
        THEN '✅ pg_cron is enabled'
        ELSE '❌ pg_cron is NOT enabled'
    END as extension_status;

-- ============================================================================
-- 2. List all scheduled cron jobs
-- ============================================================================
SELECT
    jobid,
    jobname,
    schedule,
    active,
    CASE
        WHEN command LIKE '%YOUR_PROJECT_ID%' THEN '⚠️  Contains placeholder YOUR_PROJECT_ID'
        WHEN command LIKE '%YOUR_SERVICE_ROLE_KEY%' THEN '⚠️  Contains placeholder YOUR_SERVICE_ROLE_KEY'
        ELSE '✅ Credentials configured'
    END as credential_check
FROM cron.job
ORDER BY jobname;

-- Expected: 3 jobs
-- - live-scoring-thu-sat
-- - live-scoring-sunday
-- - update-game-statistics

-- ============================================================================
-- 3. Check job execution history (last 10 runs)
-- ============================================================================
SELECT
    jobid,
    runid,
    job_pid,
    database,
    username,
    command,
    status,
    start_time,
    end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- Note: If no rows, jobs haven't run yet (they run during scheduled times)

-- ============================================================================
-- 4. Check database functions exist
-- ============================================================================
SELECT
    proname as function_name,
    '✅ Function exists' as status
FROM pg_proc
WHERE proname IN (
    'calculate_and_update_completed_game',
    'scheduled_game_statistics',
    'process_picks_for_completed_game'
)
ORDER BY proname;

-- Expected: 3 functions

-- ============================================================================
-- 5. Summary check
-- ============================================================================
SELECT
    'pg_cron enabled' as check_item,
    CASE
        WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
        THEN '✅ Pass'
        ELSE '❌ Fail'
    END as status
UNION ALL
SELECT
    'Cron jobs scheduled',
    CASE
        WHEN (SELECT COUNT(*) FROM cron.job) = 3
        THEN '✅ Pass (3 jobs)'
        ELSE '❌ Fail (' || (SELECT COUNT(*) FROM cron.job)::text || ' jobs)'
    END
UNION ALL
SELECT
    'Database functions',
    CASE
        WHEN (SELECT COUNT(*) FROM pg_proc WHERE proname IN (
            'calculate_and_update_completed_game',
            'scheduled_game_statistics',
            'process_picks_for_completed_game'
        )) = 3
        THEN '✅ Pass (3 functions)'
        ELSE '❌ Fail'
    END
UNION ALL
SELECT
    'No placeholder values',
    CASE
        WHEN EXISTS (
            SELECT 1 FROM cron.job
            WHERE command LIKE '%YOUR_PROJECT_ID%'
               OR command LIKE '%YOUR_SERVICE_ROLE_KEY%'
        )
        THEN '❌ Fail - placeholders found'
        ELSE '✅ Pass'
    END;

-- ============================================================================
-- 6. Next job execution times
-- ============================================================================
SELECT
    jobname,
    schedule,
    'Next run will be during scheduled time' as next_run_info
FROM cron.job
ORDER BY jobname;

-- To manually trigger a job for testing (optional):
-- SELECT cron.schedule('test-live-updater', '* * * * *', 'SELECT 1'); -- Run every minute for testing
-- SELECT cron.unschedule('test-live-updater'); -- Remove test job
