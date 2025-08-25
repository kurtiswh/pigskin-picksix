-- FINAL EMERGENCY BYPASS: Temporarily disable foreign key constraint
-- This allows CSV upload to proceed without user matching issues

-- Disable the foreign key constraint temporarily
ALTER TABLE public.leaguesafe_payments 
DROP CONSTRAINT IF EXISTS leaguesafe_payments_user_id_fkey;

-- Add a comment explaining this is temporary
COMMENT ON TABLE public.leaguesafe_payments IS 
'TEMPORARY: Foreign key constraint disabled for emergency CSV upload. Re-enable after upload completes.';

-- Script to re-enable the constraint after upload (DO NOT RUN YET)
-- ALTER TABLE public.leaguesafe_payments 
-- ADD CONSTRAINT leaguesafe_payments_user_id_fkey 
-- FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

SELECT 'EMERGENCY_BYPASS_APPLIED' as status;