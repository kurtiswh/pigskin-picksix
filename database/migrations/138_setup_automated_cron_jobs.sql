-- Migration 138: Setup Automated Cron Jobs for Live Scoring and Game Statistics
--
-- GOAL: Configure pg_cron to automatically trigger Edge Functions for:
-- 1. Live score updates (CFBD API polling) during game hours
-- 2. Game statistics updates at pick closure time
--
-- IMPORTANT: This migration provides the SQL setup instructions.
-- You must manually configure these in your Supabase SQL Editor as pg_cron
-- requires privileged access not available in regular migrations.

DO $$
BEGIN
    RAISE NOTICE '⏰ Migration 138: AUTOMATED CRON JOBS SETUP';
    RAISE NOTICE '===================================================';
    RAISE NOTICE 'This migration sets up automatic triggers for:';
    RAISE NOTICE '1. Live score updates during game hours';
    RAISE NOTICE '2. Game statistics updates at pick closure';
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  MANUAL SETUP REQUIRED - See instructions below';
END;
$$;

-- ============================================================================
-- INSTRUCTIONS FOR MANUAL SETUP IN SUPABASE SQL EDITOR
-- ============================================================================
--
-- After deploying the Edge Functions, run these commands in Supabase SQL Editor:
--
-- STEP 1: Enable pg_cron extension (if not already enabled)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- STEP 2: Schedule Live Score Updates
-- Replace YOUR_PROJECT_ID and YOUR_SERVICE_ROLE_KEY with actual values
--
-- Schedule for Thursday 6pm - Saturday 11:59pm CT (every 5 minutes)
-- Thursday: 00:00 UTC Friday to Saturday 5:59 UTC (Thu 6pm CT = Fri 00:00 UTC)
/*
SELECT cron.schedule(
  'live-scoring-thu-sat',
  '*/5 0-5 * * 5-7',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/live-score-updater',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
*/

-- Schedule for Sunday 12am - 8am CT (every 5 minutes)
-- Sunday 12am-8am CT = Sunday 6:00-14:00 UTC
/*
SELECT cron.schedule(
  'live-scoring-sunday',
  '*/5 6-13 * * 0',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/live-score-updater',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
*/

-- STEP 3: Schedule Game Statistics Updates
-- Runs every Saturday at 11:00 AM CT (16:00 UTC)
/*
SELECT cron.schedule(
  'update-game-statistics',
  '0 16 * * 6',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/update-game-stats',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
*/

-- ============================================================================
-- HOW TO FIND YOUR PROJECT DETAILS
-- ============================================================================
--
-- 1. PROJECT_ID:
--    - Go to Supabase Dashboard → Settings → General
--    - Copy the "Reference ID" (e.g., "zgdaqbnpgrabbxljmiqy")
--
-- 2. SERVICE_ROLE_KEY:
--    - Go to Supabase Dashboard → Settings → API
--    - Copy the "service_role" key (NOT the anon key)
--    - This is a secret key - keep it secure!
--
-- ============================================================================
-- VERIFY CRON JOBS ARE RUNNING
-- ============================================================================
--
-- Check scheduled jobs:
-- SELECT * FROM cron.job;
--
-- Check job run history:
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
-- Unschedule a job (if needed):
-- SELECT cron.unschedule('live-scoring-thu-sat');
-- SELECT cron.unschedule('live-scoring-sunday');
-- SELECT cron.unschedule('update-game-statistics');
--
-- ============================================================================

-- Grant necessary permissions for Edge Functions to call database functions
GRANT EXECUTE ON FUNCTION scheduled_game_statistics() TO service_role;

-- Verify that the database functions exist
DO $$
DECLARE
    func_exists BOOLEAN;
BEGIN
    -- Check if scheduled_game_statistics exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'scheduled_game_statistics'
    ) INTO func_exists;

    IF func_exists THEN
        RAISE NOTICE '✅ scheduled_game_statistics() function exists';
    ELSE
        RAISE WARNING '⚠️  scheduled_game_statistics() function not found - needs to be created';
    END IF;

    -- Check if process_picks_for_completed_game exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'process_picks_for_completed_game'
    ) INTO func_exists;

    IF func_exists THEN
        RAISE NOTICE '✅ process_picks_for_completed_game() function exists';
    ELSE
        RAISE WARNING '⚠️  process_picks_for_completed_game() function not found - may need to be created';
    END IF;
END;
$$;

-- ============================================================================
-- TESTING THE SETUP
-- ============================================================================
--
-- After setting up cron jobs, you can test the Edge Functions manually:
--
-- Test live-score-updater:
-- curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/live-score-updater \
--   -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
--
-- Test update-game-stats:
-- curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/update-game-stats \
--   -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
--
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 138 completed';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 NEXT STEPS:';
    RAISE NOTICE '1. Deploy Edge Functions: npx supabase functions deploy live-score-updater';
    RAISE NOTICE '2. Deploy Edge Functions: npx supabase functions deploy update-game-stats';
    RAISE NOTICE '3. Set environment variables in Supabase dashboard';
    RAISE NOTICE '4. Run the pg_cron setup commands in Supabase SQL Editor (see above)';
    RAISE NOTICE '5. Test the functions manually to verify they work';
    RAISE NOTICE '6. Monitor cron.job_run_details to verify automatic execution';
END;
$$;
