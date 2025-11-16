-- Check Cron Job Errors
-- This will show us what's failing and why

-- ============================================================================
-- 1. Get detailed error information from recent job runs
-- ============================================================================
SELECT
    j.jobname,
    jrd.jobid,
    jrd.status,
    jrd.return_message,
    jrd.start_time AT TIME ZONE 'America/Chicago' as start_time_ct,
    jrd.end_time AT TIME ZONE 'America/Chicago' as end_time_ct,
    EXTRACT(EPOCH FROM (jrd.end_time - jrd.start_time)) * 1000 as duration_ms
FROM cron.job_run_details jrd
LEFT JOIN cron.job j ON j.jobid = jrd.jobid
ORDER BY jrd.start_time DESC
LIMIT 15;

-- This will show the error messages for each failed job

-- ============================================================================
-- 2. Check which specific jobs are failing
-- ============================================================================
SELECT
    j.jobname,
    j.jobid,
    j.schedule,
    j.active,
    COUNT(CASE WHEN jrd.status = 'failed' THEN 1 END) as failed_count,
    COUNT(CASE WHEN jrd.status = 'succeeded' THEN 1 END) as success_count,
    MAX(jrd.start_time) AT TIME ZONE 'America/Chicago' as last_run_ct
FROM cron.job j
LEFT JOIN cron.job_run_details jrd ON j.jobid = jrd.jobid
GROUP BY j.jobname, j.jobid, j.schedule, j.active
ORDER BY j.jobname;

-- ============================================================================
-- 3. Show the actual command being run for each job
-- ============================================================================
SELECT
    jobname,
    schedule,
    LEFT(command, 200) as command_preview
FROM cron.job
ORDER BY jobname;

-- This helps verify the URLs and credentials are correct
