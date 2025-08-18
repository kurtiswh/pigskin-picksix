-- Create blog_posts table
CREATE TABLE public.blog_posts (
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

-- Create index for efficient querying by season/week
CREATE INDEX idx_blog_posts_season_week ON public.blog_posts(season, week);
CREATE INDEX idx_blog_posts_published ON public.blog_posts(is_published, created_at DESC);
CREATE INDEX idx_blog_posts_slug ON public.blog_posts(slug);

-- Enable RLS
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;

-- Policies for blog posts
CREATE POLICY "Anyone can read published blog posts" ON public.blog_posts
    FOR SELECT USING (is_published = true);

CREATE POLICY "Authors can read their own posts" ON public.blog_posts
    FOR SELECT USING (auth.uid() = author_id);

CREATE POLICY "Admin users can read all posts" ON public.blog_posts
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

CREATE POLICY "Admin users can insert posts" ON public.blog_posts
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

CREATE POLICY "Authors can update their own posts" ON public.blog_posts
    FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Admin users can update all posts" ON public.blog_posts
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

CREATE POLICY "Admin users can delete posts" ON public.blog_posts
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Create function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_blog_posts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating updated_at
CREATE TRIGGER update_blog_posts_updated_at_trigger
    BEFORE UPDATE ON public.blog_posts
    FOR EACH ROW
    EXECUTE FUNCTION update_blog_posts_updated_at();

-- Create function to generate slug from title
CREATE OR REPLACE FUNCTION generate_blog_slug(title TEXT, post_id UUID DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    base_slug TEXT;
    final_slug TEXT;
    counter INTEGER := 0;
BEGIN
    -- Create base slug from title
    base_slug := lower(trim(regexp_replace(title, '[^a-zA-Z0-9\s]', '', 'g')));
    base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
    base_slug := trim(base_slug, '-');
    
    -- Ensure slug is not empty
    IF base_slug = '' THEN
        base_slug := 'blog-post';
    END IF;
    
    final_slug := base_slug;
    
    -- Check for duplicates and append number if needed
    WHILE EXISTS (
        SELECT 1 FROM public.blog_posts 
        WHERE slug = final_slug 
        AND (post_id IS NULL OR id != post_id)
    ) LOOP
        counter := counter + 1;
        final_slug := base_slug || '-' || counter;
    END LOOP;
    
    RETURN final_slug;
END;
$$ LANGUAGE plpgsql;

-- Insert some sample blog posts
INSERT INTO public.blog_posts (title, content, excerpt, season, week, is_published, slug) VALUES 
(
    'Welcome to Pigskin Pick Six Pro',
    E'# Welcome to the Ultimate College Football Pick \'Em Experience\n\nWelcome to Pigskin Pick Six Pro, where meaningless games become meaningful! This season, we\'re taking college football pick \'em to the next level.\n\n## How It Works\n\nEach week, you\'ll pick 6 games against the spread. Lock in your most confident pick for bonus points, and compete for season-long glory.\n\n## What\'s New This Season\n\n- Enhanced scoring system\n- Live leaderboards\n- Detailed analytics\n- Mobile-optimized experience\n\nLet\'s make this the best season yet!',
    'Welcome to Pigskin Pick Six Pro - where meaningless games become meaningful! Learn about our enhanced pick em experience.',
    2024,
    NULL, -- Pre-season post
    true,
    'welcome-to-pigskin-pick-six-pro'
),
(
    'Week 1 Preview: Season Openers to Watch',
    E'# Week 1 Preview: The Best Season Openers\n\nWeek 1 is finally here! After months of waiting, college football is back. Here are the top matchups to keep an eye on:\n\n## Top Games\n\n### Georgia vs. Clemson\nThe marquee matchup of Week 1 features two playoff contenders...\n\n### Texas vs. Colorado State\nThe Longhorns begin their SEC journey...\n\n### Notre Dame vs. Navy\nA classic rivalry kicks off the season...\n\n## Picking Strategy\n\nFor Week 1, remember that teams are still finding their rhythm. Look for:\n- Experienced quarterbacks\n- Strong defensive lines\n- Home field advantage\n\nGood luck with your picks!',
    'Week 1 is here! Check out our preview of the top season opener matchups and picking strategies.',
    2024,
    1,
    true,
    'week-1-preview-season-openers'
);

-- Grant permissions
GRANT ALL ON public.blog_posts TO authenticated;
GRANT SELECT ON public.blog_posts TO anon;