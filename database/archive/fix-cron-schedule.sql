-- Fix Cron Schedule Syntax
-- This fixes potential day-of-week issues

-- ============================================================================
-- Issue: The schedule '*/5 0-5 * * 5-7' might not work properly
-- Solution: Use explicit day list: '*/5 0-5 * * 5,6,0' instead
-- ============================================================================

-- Unschedule existing jobs
SELECT cron.unschedule('live-scoring-thu-sat');
SELECT cron.unschedule('live-scoring-sunday');
SELECT cron.unschedule('update-game-statistics');

-- ============================================================================
-- Recreate Job 1: Thu-Sat scoring (FIXED SCHEDULE)
-- ============================================================================
SELECT cron.schedule(
    'live-scoring-thu-sat',
    '*/5 0-5 * * 5,6,0',  -- FIXED: Use 5,6,0 instead of 5-7
    $$
    SELECT
        net.http_post(
            url := 'https://zgdaqbnpgrabbxljmiqy.supabase.co/functions/v1/live-score-updater',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mzg0NTYyOCwiZXhwIjoyMDY5NDIxNjI4fQ.6ubEYOeQ7KmFN1B1AiSH9nJVEr10pS86e0VppvbIKaM'
            ),
            body := '{}'::jsonb
        ) as request_id;
    $$
);

-- ============================================================================
-- Recreate Job 2: Sunday morning scoring
-- ============================================================================
SELECT cron.schedule(
    'live-scoring-sunday',
    '*/5 6-13 * * 0',
    $$
    SELECT
        net.http_post(
            url := 'https://zgdaqbnpgrabbxljmiqy.supabase.co/functions/v1/live-score-updater',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mzg0NTYyOCwiZXhwIjoyMDY5NDIxNjI4fQ.6ubEYOeQ7KmFN1B1AiSH9nJVEr10pS86e0VppvbIKaM'
            ),
            body := '{}'::jsonb
        ) as request_id;
    $$
);

-- ============================================================================
-- Recreate Job 3: Saturday stats update
-- ============================================================================
SELECT cron.schedule(
    'update-game-statistics',
    '0 16 * * 6',
    $$
    SELECT
        net.http_post(
            url := 'https://zgdaqbnpgrabbxljmiqy.supabase.co/functions/v1/update-game-stats',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Mzg0NTYyOCwiZXhwIjoyMDY5NDIxNjI4fQ.6ubEYOeQ7KmFN1B1AiSH9nJVEr10pS86e0VppvbIKaM'
            ),
            body := '{}'::jsonb
        ) as request_id;
    $$
);

-- ============================================================================
-- Verify new schedules
-- ============================================================================
SELECT
    jobname,
    schedule,
    active,
    '✅ Recreated with fixed schedule' as status
FROM cron.job
ORDER BY jobname;

-- ============================================================================
-- Wait for next execution and check
-- ============================================================================
-- After running this, wait 1-2 minutes and run:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
