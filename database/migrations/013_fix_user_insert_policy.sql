-- Fix user creation by adding missing INSERT policy for users table
-- This allows the handle_new_user() trigger to create user records when auth users are created

-- Add INSERT policy for users table
CREATE POLICY "Allow user creation during signup" ON public.users 
FOR INSERT 
WITH CHECK (true);