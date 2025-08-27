-- Migration 055: Fix admin_email_settings RLS policies
-- 
-- Problem: Admin users cannot save email notification settings due to RLS policy issues
-- Solution: Create proper RLS policies for authenticated admin users
-- 
-- This migration ensures:
-- 1. Only authenticated admin users can read/write admin_email_settings
-- 2. Proper access control for email configuration
-- 3. Prevents anonymous access to admin settings

-- Enable RLS on admin_email_settings table (if not already enabled)
ALTER TABLE admin_email_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "admin_email_settings_select" ON admin_email_settings;
DROP POLICY IF EXISTS "admin_email_settings_insert" ON admin_email_settings;
DROP POLICY IF EXISTS "admin_email_settings_update" ON admin_email_settings;
DROP POLICY IF EXISTS "admin_email_settings_delete" ON admin_email_settings;

-- Policy 1: Authenticated admin users can SELECT from admin_email_settings
CREATE POLICY "admin_email_settings_select" ON admin_email_settings
    FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    );

-- Policy 2: Authenticated admin users can INSERT into admin_email_settings
CREATE POLICY "admin_email_settings_insert" ON admin_email_settings
    FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    );

-- Policy 3: Authenticated admin users can UPDATE admin_email_settings
CREATE POLICY "admin_email_settings_update" ON admin_email_settings
    FOR UPDATE
    USING (
        auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    )
    WITH CHECK (
        auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    );

-- Policy 4: Authenticated admin users can DELETE from admin_email_settings (optional)
CREATE POLICY "admin_email_settings_delete" ON admin_email_settings
    FOR DELETE
    USING (
        auth.role() = 'authenticated'
        AND EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.is_admin = true
        )
    );

-- Grant necessary permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_email_settings TO authenticated;

-- Ensure the table has a proper primary key and constraints (if needed)
-- This is defensive - the table should already be properly configured

-- Add comment for clarity
COMMENT ON TABLE admin_email_settings IS 'Admin-configurable email notification settings with RLS policies restricting access to authenticated admin users only';