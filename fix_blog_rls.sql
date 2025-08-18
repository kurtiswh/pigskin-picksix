-- Fix blog_posts RLS policies
-- Run this in Supabase SQL Editor

-- First, let's see what policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'blog_posts';

-- Temporarily disable RLS to test
ALTER TABLE public.blog_posts DISABLE ROW LEVEL SECURITY;

-- Grant full permissions for testing
GRANT ALL ON public.blog_posts TO authenticated;
GRANT SELECT ON public.blog_posts TO anon;

-- Test if we can now insert
INSERT INTO public.blog_posts (
    title, 
    content, 
    author_id, 
    season, 
    week, 
    is_published, 
    slug
) VALUES (
    'Test Post - RLS Fix', 
    '<p>This is a test post to verify the RLS fix works</p>', 
    '1aafe64f-43b1-4b82-a387-60d42c9261f4', -- Your user ID
    2025, 
    null, 
    true, 
    'test-post-rls-fix-' || extract(epoch from now())::text
);

-- Check if the insert worked
SELECT id, title, slug, is_published, created_at 
FROM public.blog_posts 
ORDER BY created_at DESC 
LIMIT 3;