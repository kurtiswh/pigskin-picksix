-- Migration 141: Enable Automatic Game Updates via pg_cron
--
-- PROBLEM: Games only update when manually triggered despite having auto-update infrastructure
-- ROOT CAUSE: Migration 138 provided instructions but didn't actually create cron jobs
-- SOLUTION: Enable pg_cron and create the scheduled jobs
--
-- IMPORTANT: This migration requires you to fill in your Supabase credentials:
-- 1. PROJECT_ID: Found in Supabase Dashboard → Settings → General → Reference ID
-- 2. SERVICE_ROLE_KEY: Found in Supabase Dashboard → Settings → API → service_role key
--
-- SECURITY NOTE: The SERVICE_ROLE_KEY is sensitive - only use in secure server-side contexts

DO $$
BEGIN
    RAISE NOTICE '⏰ Migration 141: ENABLE AUTOMATIC GAME UPDATES';
    RAISE NOTICE '====================================================';
    RAISE NOTICE 'This migration sets up pg_cron jobs to automatically:';
    RAISE NOTICE '1. Update game scores every 5 minutes during game hours';
    RAISE NOTICE '2. Calculate game statistics every Saturday at 11am CT';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  PREREQUISITE: Replace YOUR_PROJECT_ID and YOUR_SERVICE_ROLE_KEY';
    RAISE NOTICE '    with actual values before running this migration!';
    RAISE NOTICE '';
END;
$$;

-- ============================================================================
-- STEP 1: Enable pg_cron extension
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RAISE NOTICE '✅ pg_cron extension enabled';
    ELSE
        RAISE EXCEPTION '❌ Failed to enable pg_cron extension';
    END IF;
END;
$$;

-- ============================================================================
-- STEP 2: Create cron jobs for live score updates
-- ============================================================================

-- IMPORTANT: Before running, replace:
-- - YOUR_PROJECT_ID with your Supabase project reference ID
-- - YOUR_SERVICE_ROLE_KEY with your actual service role key

-- Job 1: Live scoring Thursday 6pm - Saturday 11:59pm CT (every 5 minutes)
-- Cron: */5 0-5 * * 5-7
-- Time: Fri 00:00 - Sun 05:59 UTC (Thu 6pm - Sat 11:59pm CT)
DO $outer1$
BEGIN
    -- Check if job already exists
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-scoring-thu-sat') THEN
        RAISE NOTICE '⚠️  Job "live-scoring-thu-sat" already exists, unscheduling first...';
        PERFORM cron.unschedule('live-scoring-thu-sat');
    END IF;

    -- Create the job
    PERFORM cron.schedule(
        'live-scoring-thu-sat',
        '*/5 0-5 * * 5-7',
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

    RAISE NOTICE '✅ Created job: live-scoring-thu-sat (Thu-Sat every 5 min)';
END;
$outer1$;

-- Job 2: Live scoring Sunday 12am - 8am CT (every 5 minutes)
-- Cron: */5 6-13 * * 0
-- Time: Sun 06:00 - 13:59 UTC (Sun 12am - 8am CT)
DO $outer2$
BEGIN
    -- Check if job already exists
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-scoring-sunday') THEN
        RAISE NOTICE '⚠️  Job "live-scoring-sunday" already exists, unscheduling first...';
        PERFORM cron.unschedule('live-scoring-sunday');
    END IF;

    -- Create the job
    PERFORM cron.schedule(
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

    RAISE NOTICE '✅ Created job: live-scoring-sunday (Sun morning every 5 min)';
END;
$outer2$;

-- ============================================================================
-- STEP 3: Create cron job for game statistics
-- ============================================================================

-- Job 3: Game statistics update every Saturday at 11:00 AM CT
-- Cron: 0 16 * * 6
-- Time: Sat 16:00 UTC (Sat 11:00 AM CT)
DO $outer3$
BEGIN
    -- Check if job already exists
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'update-game-statistics') THEN
        RAISE NOTICE '⚠️  Job "update-game-statistics" already exists, unscheduling first...';
        PERFORM cron.unschedule('update-game-statistics');
    END IF;

    -- Create the job
    PERFORM cron.schedule(
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

    RAISE NOTICE '✅ Created job: update-game-statistics (Sat 11am CT weekly)';
END;
$outer3$;

-- ============================================================================
-- STEP 4: Verify setup
-- ============================================================================

DO $$
DECLARE
    job_count INTEGER;
    job_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🔍 VERIFICATION:';
    RAISE NOTICE '';

    -- Count jobs
    SELECT COUNT(*) INTO job_count FROM cron.job;
    RAISE NOTICE '📊 Total cron jobs: %', job_count;

    -- List all jobs
    FOR job_record IN
        SELECT jobid, jobname, schedule, active
        FROM cron.job
        ORDER BY jobname
    LOOP
        RAISE NOTICE '   Job %: % (schedule: %, active: %)',
            job_record.jobid,
            job_record.jobname,
            job_record.schedule,
            job_record.active;
    END LOOP;

    RAISE NOTICE '';
END;
$$;

-- ============================================================================
-- Final Summary
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 141 COMPLETED!';
    RAISE NOTICE '';
    RAISE NOTICE '🎯 WHAT WAS CREATED:';
    RAISE NOTICE '• pg_cron extension enabled';
    RAISE NOTICE '• live-scoring-thu-sat: Every 5 min Thu 6pm - Sat 11:59pm CT';
    RAISE NOTICE '• live-scoring-sunday: Every 5 min Sun 12am - 8am CT';
    RAISE NOTICE '• update-game-statistics: Every Sat 11:00 AM CT';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  CRITICAL: Update URLs before jobs run!';
    RAISE NOTICE '   Replace YOUR_PROJECT_ID and YOUR_SERVICE_ROLE_KEY';
    RAISE NOTICE '   in the job definitions above.';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 TO UPDATE CREDENTIALS:';
    RAISE NOTICE '1. Get Project ID: Dashboard → Settings → General → Reference ID';
    RAISE NOTICE '2. Get Service Key: Dashboard → Settings → API → service_role key';
    RAISE NOTICE '3. Unschedule existing jobs:';
    RAISE NOTICE '   SELECT cron.unschedule(''live-scoring-thu-sat'');';
    RAISE NOTICE '   SELECT cron.unschedule(''live-scoring-sunday'');';
    RAISE NOTICE '   SELECT cron.unschedule(''update-game-statistics'');';
    RAISE NOTICE '4. Re-run this migration with updated credentials';
    RAISE NOTICE '';
    RAISE NOTICE '📋 VERIFY JOBS ARE RUNNING:';
    RAISE NOTICE '   SELECT * FROM cron.job;';
    RAISE NOTICE '   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 NEXT STEPS:';
    RAISE NOTICE '1. Update credentials in this migration file';
    RAISE NOTICE '2. Verify Edge Functions are deployed';
    RAISE NOTICE '3. Check environment variables in Edge Functions settings';
    RAISE NOTICE '4. Monitor job execution in cron.job_run_details';
    RAISE NOTICE '';
END;
$$;
