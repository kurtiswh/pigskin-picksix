-- Migration: Fix payment status trigger to not update views
-- This fixes the error "column updated_at of relation weekly_leaderboard does not exist"
-- Since weekly_leaderboard and season_leaderboard are now views, we cannot update them directly

-- Drop the existing trigger that tries to update the views
DROP TRIGGER IF EXISTS update_leaderboard_payment_status_trigger ON public.leaguesafe_payments;

-- Drop the function that tries to update views
DROP FUNCTION IF EXISTS public.update_leaderboard_payment_status();

-- Create a new function that doesn't try to update views
-- Since leaderboards are views, they will automatically reflect the latest payment status
-- from the leaguesafe_payments table through the view definition
CREATE OR REPLACE FUNCTION public.update_leaderboard_payment_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Since weekly_leaderboard and season_leaderboard are now views,
    -- they automatically reflect the current state of the underlying tables.
    -- We don't need to update them directly.
    -- The views will show the latest payment status from leaguesafe_payments.
    
    -- Just return NEW to allow the trigger to complete
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate the trigger (even though the function doesn't do much now)
-- This preserves compatibility if other code expects this trigger to exist
CREATE TRIGGER update_leaderboard_payment_status_trigger
    AFTER INSERT OR UPDATE ON public.leaguesafe_payments
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_leaderboard_payment_status();

-- Add comment explaining the change
COMMENT ON FUNCTION public.update_leaderboard_payment_status() IS 
'Placeholder function - leaderboards are now views that automatically reflect payment status from leaguesafe_payments';

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'Migration 111: Fixed payment status trigger to work with leaderboard views';
    RAISE NOTICE 'The trigger no longer tries to update weekly_leaderboard or season_leaderboard since they are views';
END $$;