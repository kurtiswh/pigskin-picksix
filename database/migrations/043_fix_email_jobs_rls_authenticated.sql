-- Migration: Fix email_jobs RLS policy for authenticated users
-- Issue: Authenticated users cannot create email jobs (error 42501)
-- Solution: Update RLS policies to allow authenticated users to create email jobs

-- Drop existing policies that might be blocking authenticated users
DROP POLICY IF EXISTS "Users can create email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can update their own email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can view their own email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can view email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Anyone can create email jobs" ON email_jobs;

-- Create comprehensive RLS policies for email_jobs table

-- 1. Allow authenticated users to create email jobs for themselves
CREATE POLICY "Authenticated users can create email jobs" 
ON email_jobs FOR INSERT 
TO authenticated
WITH CHECK (
  user_id = auth.uid() OR user_id IS NULL
);

-- 2. Allow anonymous users to create email jobs (for anonymous picks)
CREATE POLICY "Anonymous users can create email jobs"
ON email_jobs FOR INSERT
TO anon
WITH CHECK (user_id IS NULL);

-- 3. Allow users to view their own email jobs
CREATE POLICY "Users can view their own email jobs"
ON email_jobs FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 4. Allow anonymous viewing of anonymous email jobs
CREATE POLICY "Anonymous can view anonymous email jobs"
ON email_jobs FOR SELECT
TO anon
USING (user_id IS NULL);

-- 5. Allow service role full access (for background processing)
CREATE POLICY "Service role has full access"
ON email_jobs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 6. Allow authenticated users to update their own email jobs
CREATE POLICY "Users can update their own email jobs"
ON email_jobs FOR UPDATE
TO authenticated
USING (user_id = auth.uid() OR user_id IS NULL)
WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Ensure RLS is enabled
ALTER TABLE email_jobs ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions
GRANT ALL ON email_jobs TO authenticated;
GRANT INSERT, SELECT ON email_jobs TO anon;
GRANT ALL ON email_jobs TO service_role;

-- Add helpful comment
COMMENT ON TABLE email_jobs IS 'Email job queue with RLS policies allowing both authenticated and anonymous users to create jobs';