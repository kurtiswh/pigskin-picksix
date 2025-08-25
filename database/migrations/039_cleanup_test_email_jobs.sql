-- Clean up test email jobs to prevent reprocessing
-- Migration: 039_cleanup_test_email_jobs.sql

-- Delete all pending test email jobs (they were processed in mock mode)
DELETE FROM email_jobs 
WHERE status = 'pending' 
AND created_at < NOW() - INTERVAL '1 hour'
AND (
  subject LIKE '%Test%' 
  OR subject LIKE '%Week 1 Picks are OPEN%'
  OR email = 'test@example.com'
);

-- Update remaining old jobs to 'sent' status to prevent reprocessing
UPDATE email_jobs 
SET status = 'sent', 
    sent_at = NOW(),
    updated_at = NOW()
WHERE status = 'pending' 
AND created_at < NOW() - INTERVAL '30 minutes';

-- Add comment
COMMENT ON TABLE email_jobs IS 'Email jobs cleaned up - old test jobs removed to prevent duplicate processing';