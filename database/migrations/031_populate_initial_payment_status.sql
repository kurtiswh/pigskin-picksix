-- Migration: Populate initial payment status data in leaderboard tables
-- This updates existing leaderboard entries with current LeagueSafe payment status

-- Update weekly leaderboard with current payment status
UPDATE public.weekly_leaderboard 
SET 
    payment_status = COALESCE(lsp.status, 'NotPaid'),
    is_verified = COALESCE((lsp.status = 'Paid' AND lsp.is_matched = TRUE), FALSE),
    updated_at = NOW()
FROM public.leaguesafe_payments lsp
WHERE public.weekly_leaderboard.user_id = lsp.user_id 
    AND public.weekly_leaderboard.season = lsp.season;

-- Update season leaderboard with current payment status  
UPDATE public.season_leaderboard 
SET 
    payment_status = COALESCE(lsp.status, 'NotPaid'),
    is_verified = COALESCE((lsp.status = 'Paid' AND lsp.is_matched = TRUE), FALSE),
    updated_at = NOW()
FROM public.leaguesafe_payments lsp
WHERE public.season_leaderboard.user_id = lsp.user_id 
    AND public.season_leaderboard.season = lsp.season;

-- Log the update counts for verification
DO $$
DECLARE
    weekly_count INTEGER;
    season_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO weekly_count FROM public.weekly_leaderboard WHERE is_verified = TRUE;
    SELECT COUNT(*) INTO season_count FROM public.season_leaderboard WHERE is_verified = TRUE;
    
    RAISE NOTICE 'Payment status population complete:';
    RAISE NOTICE '- Weekly leaderboard verified entries: %', weekly_count;
    RAISE NOTICE '- Season leaderboard verified entries: %', season_count;
END $$;