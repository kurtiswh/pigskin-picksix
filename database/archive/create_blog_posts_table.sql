-- Simple blog_posts table creation script
-- Run this in your Supabase SQL Editor if the main migration isn't working

-- Drop existing table if it exists (be careful!)
-- DROP TABLE IF EXISTS public.blog_posts;

-- Create blog_posts table
CREATE TABLE IF NOT EXISTS public.blog_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    author_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    week INTEGER, -- NULL for pre-season posts
    is_published BOOLEAN DEFAULT false,
    featured_image_url TEXT,
    slug TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_season_week ON public.blog_posts(season, week);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON public.blog_posts(is_published, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON public.blog_posts(slug);

-- Disable RLS temporarily to test
ALTER TABLE public.blog_posts DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON public.blog_posts TO authenticated;
GRANT SELECT ON public.blog_posts TO anon;

-- Test insert
INSERT INTO public.blog_posts (title, content, author_id, season, week, is_published, slug) 
VALUES (
    'Test Post', 
    'This is a test post content', 
    (SELECT id FROM auth.users LIMIT 1), 
    2025, 
    1, 
    true, 
    'test-post-' || extract(epoch from now())::text
);

SELECT * FROM public.blog_posts;