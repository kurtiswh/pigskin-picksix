-- Fix the pick_source constraint to allow 'mixed' value
-- This happens when a user has both authenticated and anonymous picks

-- Drop the existing constraints
ALTER TABLE public.season_leaderboard 
DROP CONSTRAINT IF EXISTS season_leaderboard_pick_source_check;

ALTER TABLE public.weekly_leaderboard 
DROP CONSTRAINT IF EXISTS weekly_leaderboard_pick_source_check;

-- Recreate with 'mixed' allowed
ALTER TABLE public.season_leaderboard 
ADD CONSTRAINT season_leaderboard_pick_source_check 
CHECK (pick_source IN ('authenticated', 'anonymous', 'mixed'));

ALTER TABLE public.weekly_leaderboard 
ADD CONSTRAINT weekly_leaderboard_pick_source_check 
CHECK (pick_source IN ('authenticated', 'anonymous', 'mixed'));

-- Also update the pick_precedence_audit table constraint if it exists
ALTER TABLE public.pick_precedence_audit
DROP CONSTRAINT IF EXISTS valid_source_values;

ALTER TABLE public.pick_precedence_audit
ADD CONSTRAINT valid_source_values CHECK (
    previous_active_source IN ('authenticated', 'anonymous', 'none', 'mixed') AND
    new_active_source IN ('authenticated', 'anonymous', 'none', 'mixed')
);

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 114 completed: Fixed pick_source constraints to allow mixed value';
END $$;