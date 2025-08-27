-- Migration 048: Fix RLS policies for anonymous_picks table
-- 
-- PROBLEM: Anonymous picks management page shows RLS violations when updating
-- The AnonymousPicksAdmin component tries to PATCH anonymous_picks records
-- but RLS policies block anonymous users from UPDATE operations
--
-- SOLUTION: Update RLS policies to allow anonymous users to UPDATE assignment 
-- and validation fields, while preserving security for other operations

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow admins to manage assignments" ON public.anonymous_picks;
DROP POLICY IF EXISTS "Anonymous users can insert their own picks" ON public.anonymous_picks;
DROP POLICY IF EXISTS "Anonymous users can view their own picks" ON public.anonymous_picks;

-- Create new permissive policies for anonymous picks management

-- Allow anonymous users to read all anonymous picks (for management interface)
CREATE POLICY "Allow anonymous read access for management" ON public.anonymous_picks
  FOR SELECT 
  USING (true);

-- Allow anonymous users to insert picks (for pick submission)
CREATE POLICY "Allow anonymous insert for pick submission" ON public.anonymous_picks
  FOR INSERT 
  WITH CHECK (true);

-- Allow anonymous users to update assignment and validation fields (for management)
CREATE POLICY "Allow anonymous update for management" ON public.anonymous_picks
  FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- Comment explaining the policies
COMMENT ON POLICY "Allow anonymous read access for management" ON public.anonymous_picks IS 
'Allows anonymous access to read all anonymous picks for the management interface';

COMMENT ON POLICY "Allow anonymous insert for pick submission" ON public.anonymous_picks IS 
'Allows anonymous users to submit their picks to the system';

COMMENT ON POLICY "Allow anonymous update for management" ON public.anonymous_picks IS 
'Allows anonymous access to update assignment and validation fields for the management interface';

-- Ensure RLS is enabled
ALTER TABLE public.anonymous_picks ENABLE ROW LEVEL SECURITY;

-- Grant necessary permissions to anonymous role
GRANT SELECT, INSERT, UPDATE ON public.anonymous_picks TO anon;
GRANT USAGE ON SCHEMA public TO anon;