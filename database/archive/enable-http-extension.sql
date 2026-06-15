-- Enable HTTP Extension for pg_cron to call Edge Functions
-- This is likely the issue if jobs are failing immediately

-- ============================================================================
-- 1. Check if http extension exists
-- ============================================================================
SELECT
    extname as extension,
    CASE
        WHEN extname IS NOT NULL THEN '✅ HTTP extension installed'
        ELSE '❌ HTTP extension NOT installed'
    END as status
FROM pg_extension
WHERE extname = 'http';

-- ============================================================================
-- 2. Enable http extension (if not already enabled)
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS http;

-- ============================================================================
-- 3. Verify it's enabled
-- ============================================================================
SELECT
    extname as extension,
    '✅ HTTP extension now enabled' as status
FROM pg_extension
WHERE extname = 'http';

-- ============================================================================
-- 4. Test the http extension with a simple call
-- ============================================================================
SELECT
    status,
    content::text as response
FROM
    http_get('https://httpbin.org/status/200');

-- Should return: status = 200

-- ============================================================================
-- EXPLANATION
-- ============================================================================
-- The pg_cron jobs use net.http_post() which requires the 'http' extension.
-- If this extension is missing, all cron jobs will fail immediately.
--
-- After enabling this extension, the cron jobs should start working!
