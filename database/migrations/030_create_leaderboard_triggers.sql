-- Migration: Create the actual triggers for real-time leaderboard updates

-- ===================================================================
-- TRIGGER 1: LeagueSafe payment status changes → Update leaderboard payment status
-- ===================================================================

CREATE TRIGGER update_leaderboard_payment_status_trigger
    AFTER INSERT OR UPDATE ON public.leaguesafe_payments
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_leaderboard_payment_status();

-- ===================================================================
-- TRIGGER 2: Picks changes → Update weekly and season leaderboards
-- ===================================================================

-- Weekly leaderboard updates when picks change
CREATE TRIGGER update_weekly_leaderboard_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.picks
    FOR EACH ROW 
    EXECUTE FUNCTION public.recalculate_weekly_leaderboard();

-- Season leaderboard updates when picks change  
CREATE TRIGGER update_season_leaderboard_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.picks
    FOR EACH ROW 
    EXECUTE FUNCTION public.recalculate_season_leaderboard();

-- ===================================================================
-- TRIGGER 3: Anonymous pick assignment → Update leaderboards
-- ===================================================================

CREATE TRIGGER handle_anonymous_pick_assignment_trigger
    AFTER UPDATE ON public.anonymous_picks
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_anonymous_pick_assignment();

-- ===================================================================
-- COMMENTS
-- ===================================================================

COMMENT ON TRIGGER update_leaderboard_payment_status_trigger ON public.leaguesafe_payments IS 
'Updates payment_status and is_verified columns in leaderboard tables when LeagueSafe payment status changes';

COMMENT ON TRIGGER update_weekly_leaderboard_trigger ON public.picks IS 
'Recalculates weekly leaderboard entries when picks are inserted, updated, or deleted';

COMMENT ON TRIGGER update_season_leaderboard_trigger ON public.picks IS 
'Recalculates season leaderboard entries when picks are inserted, updated, or deleted';

COMMENT ON TRIGGER handle_anonymous_pick_assignment_trigger ON public.anonymous_picks IS 
'Updates leaderboards when anonymous picks are assigned to registered users';