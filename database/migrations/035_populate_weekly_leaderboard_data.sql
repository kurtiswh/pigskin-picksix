-- Migration: Populate weekly leaderboard data from existing picks
-- This migration calculates and inserts weekly leaderboard entries for all users with picks

-- Temporarily disable RLS for this migration
SET session_replication_role = replica;

-- Clear existing weekly leaderboard data for 2024 to start fresh
DELETE FROM public.weekly_leaderboard WHERE season = 2024;

-- Insert weekly leaderboard entries calculated from picks
WITH weekly_stats AS (
  SELECT 
    p.user_id,
    u.display_name,
    p.week,
    p.season,
    COUNT(p.id) as picks_made,
    COUNT(CASE WHEN p.result = 'win' THEN 1 END) as wins,
    COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as losses,
    COUNT(CASE WHEN p.result = 'push' THEN 1 END) as pushes,
    COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
    COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
    COALESCE(SUM(p.points_earned), 0) as total_points,
    -- Get payment status from leaguesafe_payments if available
    COALESCE(lsp.status, 'NotPaid') as payment_status,
    -- Get verified status
    COALESCE((lsp.status = 'Paid' AND lsp.is_matched = TRUE), FALSE) as is_verified
  FROM public.picks p
  JOIN public.users u ON p.user_id = u.id
  LEFT JOIN public.leaguesafe_payments lsp ON p.user_id = lsp.user_id AND p.season = lsp.season
  WHERE p.season = 2024
  GROUP BY p.user_id, u.display_name, p.week, p.season, lsp.status, lsp.is_matched
  HAVING COUNT(p.id) > 0
),
ranked_stats AS (
  SELECT 
    *,
    RANK() OVER (PARTITION BY week, season ORDER BY total_points DESC) as weekly_rank
  FROM weekly_stats
)
INSERT INTO public.weekly_leaderboard (
  user_id, display_name, week, season, picks_made, wins, losses, pushes,
  lock_wins, lock_losses, total_points, weekly_rank, payment_status, is_verified
)
SELECT 
  user_id, display_name, week, season, picks_made, wins, losses, pushes,
  lock_wins, lock_losses, total_points, weekly_rank, payment_status, is_verified
FROM ranked_stats
ORDER BY week, weekly_rank;

-- Re-enable RLS
SET session_replication_role = DEFAULT;

-- Update any missing payment statuses using existing leaguesafe_payments data
UPDATE public.weekly_leaderboard 
SET 
  payment_status = lsp.status,
  is_verified = (lsp.status = 'Paid' AND lsp.is_matched = TRUE),
  updated_at = NOW()
FROM public.leaguesafe_payments lsp 
WHERE weekly_leaderboard.user_id = lsp.user_id 
  AND weekly_leaderboard.season = lsp.season
  AND weekly_leaderboard.season = 2024;

-- Log results for verification
DO $$
DECLARE
  total_entries INTEGER;
  weeks_covered INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_entries FROM public.weekly_leaderboard WHERE season = 2024;
  SELECT COUNT(DISTINCT week) INTO weeks_covered FROM public.weekly_leaderboard WHERE season = 2024;
  
  RAISE NOTICE 'Weekly leaderboard population complete:';
  RAISE NOTICE '- Total entries: %', total_entries;
  RAISE NOTICE '- Weeks covered: %', weeks_covered;
END $$;