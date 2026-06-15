-- Fix pg_cron Database Configuration
-- pg_cron needs to know which database to connect to for running jobs

-- ============================================================================
-- 1. Check current database name
-- ============================================================================
SELECT
    current_database() as your_database_name,
    'This is the database you are currently connected to' as info;

-- ============================================================================
-- 2. Check what pg_cron is configured to use
-- ============================================================================
SELECT
    name as setting_name,
    setting as current_value,
    CASE
        WHEN setting = current_database() THEN '✅ Matches current database'
        ELSE '❌ MISMATCH - pg_cron is configured for: ' || setting
    END as status
FROM pg_settings
WHERE name = 'cron.database_name';

-- ============================================================================
-- 3. DIAGNOSIS
-- ============================================================================
-- If there's a mismatch, pg_cron jobs won't run because they're trying
-- to connect to the wrong database.
--
-- SOLUTION: You need to update the Supabase postgres configuration.
-- This typically requires:
--   1. Going to Supabase Dashboard → Database → Configuration
--   2. OR contacting Supabase support to update cron.database_name
--   3. OR using Supabase CLI to update the config
--
-- ============================================================================

-- ============================================================================
-- 4. WORKAROUND: Recreate jobs in the 'postgres' database
-- ============================================================================
-- Alternative: If pg_cron is configured for 'postgres' database,
-- you can create the jobs there instead.
--
-- However, this is NOT RECOMMENDED because:
-- - Your actual data is in a different database
-- - The jobs won't have access to your tables
--
-- ============================================================================

-- ============================================================================
-- 5. Check if we're in the right database
-- ============================================================================
SELECT
    CASE
        WHEN current_database() = (SELECT setting FROM pg_settings WHERE name = 'cron.database_name')
        THEN '✅ You are in the correct database for pg_cron'
        ELSE '❌ pg_cron is configured for: ' ||
             (SELECT setting FROM pg_settings WHERE name = 'cron.database_name') ||
             ' but you are in: ' || current_database()
    END as database_check;

-- ============================================================================
-- 6. List all databases available
-- ============================================================================
SELECT
    datname as database_name,
    CASE
        WHEN datname = (SELECT setting FROM pg_settings WHERE name = 'cron.database_name')
        THEN '← pg_cron points here'
        WHEN datname = current_database()
        THEN '← you are here'
        ELSE ''
    END as marker
FROM pg_database
WHERE datistemplate = false
ORDER BY datname;

-- ============================================================================
-- NEXT STEPS
-- ============================================================================
-- Based on the results above:
--
-- OPTION A: Change pg_cron configuration (RECOMMENDED)
--   Contact Supabase support or use their dashboard to set:
--   cron.database_name = 'your_actual_database_name'
--
-- OPTION B: Move your cron jobs to the postgres database
--   This requires having access to the 'postgres' database
--   and may not work with Supabase's security model
--
-- OPTION C: Use Supabase Edge Functions + external cron service
--   Use a service like cron-job.org or GitHub Actions
--   to trigger your Edge Functions on a schedule
--   This is actually the EASIEST solution for Supabase!
--
-- ============================================================================
