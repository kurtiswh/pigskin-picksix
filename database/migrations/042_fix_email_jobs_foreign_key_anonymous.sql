-- Fix email_jobs foreign key constraint to allow anonymous email sending
-- Migration: 042_fix_email_jobs_foreign_key_anonymous.sql

-- The current constraint requires user_id to exist in users table
-- But we need to support anonymous pick confirmations where user_id might be:
-- 1. NULL (for truly anonymous)
-- 2. A placeholder like 'anonymous' 
-- 3. A user_id that doesn't exist yet

-- Option 1: Make user_id nullable and remove the foreign key constraint
-- This allows anonymous emails with user_id = NULL
ALTER TABLE email_jobs ALTER COLUMN user_id DROP NOT NULL;

-- Drop the existing foreign key constraint
ALTER TABLE email_jobs DROP CONSTRAINT IF EXISTS email_jobs_user_id_fkey;

-- Add a new conditional foreign key constraint that only applies when user_id is not null
-- This allows NULL user_id for anonymous emails, but validates real user_ids
ALTER TABLE email_jobs ADD CONSTRAINT email_jobs_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    NOT VALID; -- This allows existing data that might violate the constraint

-- Validate the constraint only for non-null values
-- (PostgreSQL will automatically handle this correctly)

-- Update RLS policies to handle anonymous emails
-- Replace the restrictive insert policy with one that allows anonymous emails

DROP POLICY IF EXISTS "Authenticated users can insert email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Allow anonymous email job creation" ON email_jobs;
DROP POLICY IF EXISTS "Allow email job creation" ON email_jobs;

-- Allow all inserts (anonymous and authenticated)
-- The application logic controls what gets inserted
CREATE POLICY "Allow email job creation" ON email_jobs
    FOR INSERT WITH CHECK (true);

-- Update select policy to allow viewing anonymous emails too
DROP POLICY IF EXISTS "Users can view own email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can view email jobs" ON email_jobs;

CREATE POLICY "Users can view email jobs" ON email_jobs
    FOR SELECT USING (
        auth.uid() = user_id OR  -- Own emails
        user_id IS NULL OR       -- Anonymous emails  
        auth.role() = 'service_role' -- Service role can see all
    );

-- Update policy to allow updates for anonymous emails too
DROP POLICY IF EXISTS "Users can update own email jobs" ON email_jobs;
DROP POLICY IF EXISTS "Users can update email jobs" ON email_jobs;

CREATE POLICY "Users can update email jobs" ON email_jobs
    FOR UPDATE USING (
        auth.uid() = user_id OR  -- Own emails
        user_id IS NULL OR       -- Anonymous emails
        auth.role() = 'service_role' -- Service role can update all
    );

-- Add comment explaining the change
COMMENT ON COLUMN email_jobs.user_id IS 'User ID (nullable for anonymous email jobs)';

-- Add index for nullable user_id queries
CREATE INDEX IF NOT EXISTS idx_email_jobs_user_id_nullable ON email_jobs (user_id) WHERE user_id IS NOT NULL;