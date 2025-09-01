-- Migration 095: Add result tracking and pick set precedence to anonymous_picks
-- Purpose: Enable win/loss tracking for anonymous picks and manage duplicate pick sets

-- Step 1: Add missing result tracking columns to anonymous_picks table
ALTER TABLE public.anonymous_picks 
ADD COLUMN IF NOT EXISTS result pick_result,
ADD COLUMN IF NOT EXISTS points_earned INTEGER,
ADD COLUMN IF NOT EXISTS submitted BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS is_active_pick_set BOOLEAN DEFAULT TRUE;

-- Step 2: Add indexes for performance on new columns
CREATE INDEX IF NOT EXISTS idx_anonymous_picks_result ON public.anonymous_picks(result);
CREATE INDEX IF NOT EXISTS idx_anonymous_picks_points_earned ON public.anonymous_picks(points_earned);
CREATE INDEX IF NOT EXISTS idx_anonymous_picks_is_active ON public.anonymous_picks(is_active_pick_set);
CREATE INDEX IF NOT EXISTS idx_anonymous_picks_user_week_season ON public.anonymous_picks(assigned_user_id, week, season) 
WHERE assigned_user_id IS NOT NULL;

-- Step 3: Add composite index for efficient conflict detection
CREATE INDEX IF NOT EXISTS idx_anonymous_picks_conflict_detection ON public.anonymous_picks(assigned_user_id, week, season, is_active_pick_set) 
WHERE assigned_user_id IS NOT NULL;

-- Step 4: Update RLS policies to include new columns in queries
-- (Existing policies should automatically cover new columns, but let's be explicit about admin access)

-- Admin policy update for managing pick set conflicts
DROP POLICY IF EXISTS "Allow admins to manage pick sets" ON public.anonymous_picks;
CREATE POLICY "Allow admins to manage pick sets" ON public.anonymous_picks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND users.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users 
      WHERE users.id = auth.uid() 
      AND users.is_admin = true
    )
  );

-- Step 5: Add comment explaining the new columns
COMMENT ON COLUMN public.anonymous_picks.result IS 'Pick result (win/loss/push) - populated when game completes';
COMMENT ON COLUMN public.anonymous_picks.points_earned IS 'Points earned from this pick (0-40) - populated when game completes';
COMMENT ON COLUMN public.anonymous_picks.submitted IS 'Whether pick was formally submitted (consistency with picks table)';
COMMENT ON COLUMN public.anonymous_picks.is_active_pick_set IS 'Whether these picks count for scoring (false if user has authenticated picks for same week)';

-- Step 6: Add table comment explaining pick set precedence
COMMENT ON TABLE public.anonymous_picks IS 'Anonymous picks with result tracking. When assigned to users, authenticated picks take precedence over anonymous picks for the same week (is_active_pick_set determines which count for scoring).';