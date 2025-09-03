-- Migration: Add missing result and points_earned columns to anonymous_picks table
-- These columns are needed for the pick processing system to update anonymous picks

-- Add the missing columns that exist in the picks table
ALTER TABLE public.anonymous_picks 
ADD COLUMN result TEXT CHECK (result IN ('win', 'loss', 'push', 'pending'));

ALTER TABLE public.anonymous_picks 
ADD COLUMN points_earned INTEGER DEFAULT 0;

-- Add index for performance when querying by result
CREATE INDEX idx_anonymous_picks_result ON public.anonymous_picks(result);

-- Add comments for clarity
COMMENT ON COLUMN public.anonymous_picks.result IS 'Pick result: win, loss, push, or pending';
COMMENT ON COLUMN public.anonymous_picks.points_earned IS 'Points earned for this pick (20 for win, 10 for lock win, 0 for loss/push)';