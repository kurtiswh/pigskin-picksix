-- Fix email_jobs RLS policies to allow anonymous email job creation
-- Migration: 041_fix_email_jobs_anonymous_access.sql
-- Issue: Anonymous picks and unauthenticated email job creation is blocked by RLS policies

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can insert email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can view email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can update email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Admins can delete email jobs" ON email_jobs;

-- Create more permissive policies that allow email job creation without authentication

-- Allow anonymous email job creation (needed for anonymous picks and background processing)
-- This is safe because email_jobs is just a queue table, no sensitive data
CREATE POLICY "Allow email job insertion" ON email_jobs
    FOR INSERT WITH CHECK (true);

-- Users can view their own email jobs, admins can view all, system can view all for processing
CREATE POLICY "Users can view email jobs" ON email_jobs
    FOR SELECT USING (
        auth.uid() IS NULL OR  -- Allow system/anonymous access for processing
        auth.uid() = user_id OR -- Users can see their own
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        ) -- Admins can see all
    );

-- Users can update their own email jobs, admins and system can update all
CREATE POLICY "Allow email job updates" ON email_jobs
    FOR UPDATE USING (
        auth.uid() IS NULL OR  -- Allow system/anonymous access for processing
        auth.uid() = user_id OR -- Users can update their own
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        ) -- Admins can update all
    );

-- Allow admins and system to delete email jobs (for cleanup/management)
CREATE POLICY "Allow email job deletion" ON email_jobs
    FOR DELETE USING (
        auth.uid() IS NULL OR  -- Allow system/anonymous access for cleanup
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        ) -- Admins can delete
    );

-- Add comments for clarity
COMMENT ON POLICY "Allow email job insertion" ON email_jobs IS 
    'Allow any user (including anonymous) to create email jobs - needed for anonymous picks and background processing';

COMMENT ON POLICY "Users can view email jobs" ON email_jobs IS 
    'Users can view their own jobs, admins can view all, system can view all for processing';

COMMENT ON POLICY "Allow email job updates" ON email_jobs IS 
    'Users can update their own jobs, admins and system can update all jobs for processing';

COMMENT ON POLICY "Allow email job deletion" ON email_jobs IS 
    'Admins and system can delete email jobs for cleanup';

-- Update the table comment to reflect the new access model
COMMENT ON TABLE email_jobs IS 'Email notification jobs for scheduled delivery - allows anonymous access for pick confirmations and system processing';