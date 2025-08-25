-- Fix email_jobs RLS policies to allow proper email job creation
-- Migration: 038_fix_email_jobs_rls_policies.sql

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Authenticated users can insert email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can view own email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can update own email jobs" ON email_jobs;

-- Create more permissive policies for email job management

-- Allow authenticated users to insert email jobs for any user (admin functionality)
-- This is necessary for the notification system to create jobs for all users
CREATE POLICY "Authenticated users can insert email jobs" ON email_jobs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Users can view their own email jobs, admins can view all
CREATE POLICY "Users can view email jobs" ON email_jobs
    FOR SELECT USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    );

-- Users can update their own email jobs, admins can update all
CREATE POLICY "Users can update email jobs" ON email_jobs
    FOR UPDATE USING (
        auth.uid() = user_id OR 
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    );

-- Allow admins to delete email jobs (for cleanup/management)
CREATE POLICY "Admins can delete email jobs" ON email_jobs
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    );

-- Add comments for clarity
COMMENT ON POLICY "Authenticated users can insert email jobs" ON email_jobs IS 
    'Allow any authenticated user to create email jobs - used by notification system';

COMMENT ON POLICY "Users can view email jobs" ON email_jobs IS 
    'Users can view their own jobs, admins can view all jobs';

COMMENT ON POLICY "Users can update email jobs" ON email_jobs IS 
    'Users can update their own jobs, admins can update all jobs';

COMMENT ON POLICY "Admins can delete email jobs" ON email_jobs IS 
    'Only admins can delete email jobs for cleanup';