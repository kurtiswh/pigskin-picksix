-- Fix blog_posts RLS policies for proper access control

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Anyone can read published blog posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Authors can read their own posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admin users can read all posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admin users can insert posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Authors can update their own posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admin users can update all posts" ON public.blog_posts;
DROP POLICY IF EXISTS "Admin users can delete posts" ON public.blog_posts;

-- ============================================================================
-- SELECT POLICIES (Reading blog posts)
-- ============================================================================

-- 1. Anyone (including anonymous users) can read published blog posts
CREATE POLICY "Anyone can read published blog posts" ON public.blog_posts
    FOR SELECT 
    TO public
    USING (is_published = true);

-- 2. Admin users can read all posts (including unpublished drafts)
CREATE POLICY "Admin users can read all posts" ON public.blog_posts
    FOR SELECT 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- 3. Authors can read their own posts (including drafts)
CREATE POLICY "Authors can read their own posts" ON public.blog_posts
    FOR SELECT 
    TO authenticated
    USING (auth.uid() = author_id);

-- ============================================================================
-- INSERT POLICIES (Creating blog posts)
-- ============================================================================

-- Only admin users can create new blog posts
CREATE POLICY "Admin users can insert posts" ON public.blog_posts
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- ============================================================================
-- UPDATE POLICIES (Editing blog posts) 
-- ============================================================================

-- Admin users can update any post
CREATE POLICY "Admin users can update all posts" ON public.blog_posts
    FOR UPDATE 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND is_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- Authors can update their own posts
CREATE POLICY "Authors can update their own posts" ON public.blog_posts
    FOR UPDATE 
    TO authenticated
    USING (auth.uid() = author_id)
    WITH CHECK (auth.uid() = author_id);

-- ============================================================================
-- DELETE POLICIES (Deleting blog posts)
-- ============================================================================

-- Only admin users can delete blog posts
CREATE POLICY "Admin users can delete posts" ON public.blog_posts
    FOR DELETE 
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND is_admin = true
        )
    );

-- ============================================================================
-- PERMISSIONS VERIFICATION
-- ============================================================================

-- Ensure proper table permissions are set
GRANT ALL ON public.blog_posts TO authenticated;
GRANT SELECT ON public.blog_posts TO anon;

-- Also ensure users table permissions for RLS policy lookups
GRANT SELECT ON public.users TO authenticated;

-- ============================================================================
-- POLICY TESTING COMMENTS
-- ============================================================================

-- These policies ensure:
-- 1. ✅ Anonymous users can view published blog posts
-- 2. ✅ Authenticated users can view published blog posts  
-- 3. ✅ Admin users can view ALL posts (including drafts)
-- 4. ✅ Authors can view their own posts (including drafts)
-- 5. ✅ Only admin users can create new posts
-- 6. ✅ Admin users can edit any post
-- 7. ✅ Authors can edit their own posts
-- 8. ✅ Only admin users can delete posts