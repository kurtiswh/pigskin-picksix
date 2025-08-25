-- Aggressive cleanup of all test email jobs
-- Migration: 040_aggressive_email_cleanup.sql

-- First, let's see what we have
SELECT status, COUNT(*) as count, template_type 
FROM email_jobs 
GROUP BY status, template_type;

-- Delete ALL pending email jobs (they're all test data)
DELETE FROM email_jobs WHERE status = 'pending';

-- Also clean up any failed test jobs
DELETE FROM email_jobs 
WHERE status = 'failed' 
AND (
  email LIKE '%test%' 
  OR email = 'test@example.com'
  OR subject LIKE '%Test%'
  OR subject LIKE '%Week 1%'
);

-- Verify cleanup
SELECT status, COUNT(*) as count, template_type 
FROM email_jobs 
GROUP BY status, template_type;

COMMENT ON TABLE email_jobs IS 'All pending test email jobs removed - ready for clean testing';