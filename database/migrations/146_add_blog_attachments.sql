-- Migration 146: Add Attachments Support to Blog Posts
--
-- PURPOSE: Allow blog posts to have file attachments (PDFs, images, documents, etc.)
--
-- FEATURES:
-- - Store multiple attachments per blog post
-- - Track filename, URL, file type, and size
-- - Display attachments section in blog posts

DO $$
BEGIN
    RAISE NOTICE '📎 Migration 146: ADD BLOG POST ATTACHMENTS';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Adding attachments array to blog_posts table';
    RAISE NOTICE '';
END;
$$;

-- Add attachments column to blog_posts table
-- Using JSONB array to store multiple attachments
ALTER TABLE public.blog_posts
ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.blog_posts.attachments IS
'Array of attachment objects: [{"name": "file.pdf", "url": "https://...", "type": "application/pdf", "size": 12345}]';

-- Verify the column was added
DO $$
DECLARE
    column_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'blog_posts'
          AND column_name = 'attachments'
    ) INTO column_exists;

    IF column_exists THEN
        RAISE NOTICE '✅ attachments column added successfully';
    ELSE
        RAISE WARNING '⚠️  Failed to add attachments column';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '📊 ATTACHMENT FORMAT:';
    RAISE NOTICE '{';
    RAISE NOTICE '  "name": "Weekly Picks Analysis.pdf",';
    RAISE NOTICE '  "url": "https://storage.supabase.co/...",';
    RAISE NOTICE '  "type": "application/pdf",';
    RAISE NOTICE '  "size": 245678';
    RAISE NOTICE '}';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 146 COMPLETED!';
    RAISE NOTICE '';
END;
$$;
