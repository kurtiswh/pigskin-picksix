-- Migration 169: editable email rundown for recap posts
-- Stores the (editable) "rundown" shown in the recap email, separate from the
-- 300-char blog excerpt/teaser. Pre-filled from the recap seed, editable in the
-- Blog Editor, rendered as a formatted list in the email.
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS email_rundown text;
