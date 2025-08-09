-- Debug query to check picks submission status
-- Run this in your Supabase SQL editor to see the current state

SELECT 
    id,
    user_id,
    selected_team,
    is_lock,
    submitted,
    submitted_at,
    created_at
FROM public.picks 
WHERE week = 1 AND season = 2025
ORDER BY user_id, created_at;

-- Also check if the columns exist
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'picks' AND table_schema = 'public'
ORDER BY ordinal_position;