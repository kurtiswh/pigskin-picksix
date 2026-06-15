-- Diagnose Cron Schedule Issues
-- Check if jobs SHOULD be running right now

-- ============================================================================
-- 1. What time is it now? (In different timezones)
-- ============================================================================
SELECT
    NOW() as current_utc,
    NOW() AT TIME ZONE 'America/Chicago' as current_ct,
    EXTRACT(DOW FROM NOW()) as day_of_week_utc, -- 0=Sunday, 5=Friday, 6=Saturday
    EXTRACT(HOUR FROM NOW()) as hour_utc,
    EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Chicago') as hour_ct,
    EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Chicago') as day_of_week_ct;

-- ============================================================================
-- 2. Show all jobs with their schedules
-- ============================================================================
SELECT
    jobname,
    schedule,
    active,
    CASE jobname
        WHEN 'live-scoring-thu-sat' THEN 'Runs: Thu 6pm-Sat 11:59pm CT (Fri-Sun 00:00-05:59 UTC) - Days 5,6,7 Hours 0-5'
        WHEN 'live-scoring-sunday' THEN 'Runs: Sun 12am-8am CT (Sun 06:00-13:59 UTC) - Day 0 Hours 6-13'
        WHEN 'update-game-statistics' THEN 'Runs: Sat 11am CT (Sat 16:00 UTC) - Day 6 Hour 16'
        ELSE 'Unknown schedule'
    END as schedule_description
FROM cron.job
ORDER BY jobname;

-- ============================================================================
-- 3. Check if jobs SHOULD be running right now
-- ============================================================================
WITH time_info AS (
    SELECT
        EXTRACT(DOW FROM NOW()) as current_dow_utc,
        EXTRACT(HOUR FROM NOW()) as current_hour_utc,
        EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Chicago') as current_dow_ct,
        EXTRACT(HOUR FROM NOW() AT TIME ZONE 'America/Chicago') as current_hour_ct
)
SELECT
    j.jobname,
    j.schedule,
    j.active,
    ct.current_dow_utc,
    ct.current_hour_utc,
    CASE
        -- live-scoring-thu-sat: */5 0-5 * * 5-7 (Fri-Sun 00:00-05:59 UTC)
        WHEN j.jobname = 'live-scoring-thu-sat'
            AND ct.current_dow_utc IN (5, 6, 0) -- Friday=5, Saturday=6, Sunday=0
            AND ct.current_hour_utc BETWEEN 0 AND 5
        THEN '✅ SHOULD BE RUNNING NOW'

        -- live-scoring-sunday: */5 6-13 * * 0 (Sunday 06:00-13:59 UTC)
        WHEN j.jobname = 'live-scoring-sunday'
            AND ct.current_dow_utc = 0 -- Sunday
            AND ct.current_hour_utc BETWEEN 6 AND 13
        THEN '✅ SHOULD BE RUNNING NOW'

        -- update-game-statistics: 0 16 * * 6 (Saturday 16:00 UTC)
        WHEN j.jobname = 'update-game-statistics'
            AND ct.current_dow_utc = 6 -- Saturday
            AND ct.current_hour_utc = 16
        THEN '✅ SHOULD BE RUNNING NOW'

        ELSE '⏰ Not in scheduled window'
    END as should_run_status
FROM cron.job j, time_info ct
ORDER BY j.jobname;

-- ============================================================================
-- 4. Check recent job execution pattern
-- ============================================================================
SELECT
    j.jobname,
    COUNT(*) as total_runs,
    COUNT(CASE WHEN jrd.status = 'succeeded' THEN 1 END) as succeeded,
    COUNT(CASE WHEN jrd.status = 'failed' THEN 1 END) as failed,
    MAX(jrd.start_time) AT TIME ZONE 'America/Chicago' as last_run_ct,
    MIN(jrd.start_time) AT TIME ZONE 'America/Chicago' as first_run_ct
FROM cron.job j
LEFT JOIN cron.job_run_details jrd ON j.jobid = jrd.jobid
GROUP BY j.jobname
ORDER BY j.jobname;

-- ============================================================================
-- 5. Show WHEN jobs last ran and WHEN they should run next
-- ============================================================================
SELECT
    j.jobname,
    j.schedule,
    j.active,
    MAX(jrd.start_time) AT TIME ZONE 'America/Chicago' as last_execution_ct,
    CASE
        WHEN MAX(jrd.start_time) IS NULL THEN 'Never ran'
        WHEN MAX(jrd.start_time) < NOW() - INTERVAL '10 minutes' THEN '⚠️  Last run > 10 min ago'
        ELSE '✅ Recently executed'
    END as execution_status
FROM cron.job j
LEFT JOIN cron.job_run_details jrd ON j.jobid = jrd.jobid
GROUP BY j.jobname, j.schedule, j.active
ORDER BY j.jobname;

-- ============================================================================
-- 6. Check if pg_cron is actually running
-- ============================================================================
SELECT
    setting as pg_cron_status,
    CASE
        WHEN setting = 'on' THEN '✅ pg_cron is enabled in postgresql.conf'
        ELSE '❌ pg_cron may not be enabled in config'
    END as status
FROM pg_settings
WHERE name = 'cron.database_name';

-- ============================================================================
-- 7. CRON SCHEDULE REFERENCE
-- ============================================================================
-- Format: minute hour day_of_month month day_of_week
--
-- live-scoring-thu-sat:  */5 0-5 * * 5-7
--   Every 5 minutes, hours 0-5 UTC, on Fri(5)/Sat(6)/Sun(0)
--   = Thu 6pm - Sat 11:59pm CT
--
-- live-scoring-sunday:   */5 6-13 * * 0
--   Every 5 minutes, hours 6-13 UTC, on Sunday(0)
--   = Sun 12am - 8am CT
--
-- update-game-statistics: 0 16 * * 6
--   At minute 0, hour 16 UTC, on Saturday(6)
--   = Sat 11am CT
--
-- NOTE: In cron, Sunday can be both 0 and 7!
--       Day 5-7 means Fri(5), Sat(6), Sun(7)
--       Day 0 means Sun(0)
