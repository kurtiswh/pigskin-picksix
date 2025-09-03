-- Check and Fix Admin Permissions
-- Copy and paste this into your Supabase SQL Editor

-- First, let's see what your current user ID is and admin status
SELECT 
    id,
    email,
    display_name,
    is_admin,
    created_at
FROM public.users 
WHERE email = auth.email();

-- If you need to grant admin access to your user, uncomment and run this:
-- (Replace 'your-email@example.com' with your actual email)
/*
UPDATE public.users 
SET is_admin = true 
WHERE email = 'your-email@example.com';
*/

-- Let's also check if the auth.uid() function is working correctly
SELECT 
    auth.uid() as current_auth_uid,
    auth.email() as current_auth_email;

-- Check if there are any admin users in the system
SELECT 
    email,
    display_name,
    is_admin,
    created_at
FROM public.users 
WHERE is_admin = true
ORDER BY created_at;

-- Alternative: Create a version of the function that shows more debug info
CREATE OR REPLACE FUNCTION public.debug_toggle_picks_leaderboard_visibility(
    target_user_id UUID,
    target_season INTEGER,
    target_week INTEGER DEFAULT NULL,
    show_on_leaderboard BOOLEAN DEFAULT TRUE
)
RETURNS TABLE(
    current_user_id UUID,
    current_user_email TEXT,
    is_current_user_admin BOOLEAN,
    affected_picks INTEGER,
    operation_status TEXT
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    picks_updated INTEGER := 0;
    current_uid UUID;
    current_email TEXT;
    is_admin_user BOOLEAN;
BEGIN
    -- Get current user info
    current_uid := auth.uid();
    current_email := auth.email();
    
    -- Check if current user is admin
    SELECT u.is_admin INTO is_admin_user
    FROM public.users u 
    WHERE u.id = current_uid;
    
    -- If not admin, still return info for debugging
    IF NOT COALESCE(is_admin_user, false) THEN
        RETURN QUERY SELECT 
            current_uid,
            current_email,
            COALESCE(is_admin_user, false),
            0 as affected_picks,
            'Access denied: User is not admin' as operation_status;
        RETURN;
    END IF;
    
    -- Update picks visibility (same logic as before)
    IF target_week IS NULL THEN
        UPDATE public.picks 
        SET show_on_leaderboard = debug_toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    ELSE
        UPDATE public.picks 
        SET show_on_leaderboard = debug_toggle_picks_leaderboard_visibility.show_on_leaderboard
        WHERE user_id = target_user_id 
        AND season = target_season 
        AND week = target_week;
        GET DIAGNOSTICS picks_updated = ROW_COUNT;
    END IF;
    
    -- Return results with debug info
    RETURN QUERY SELECT 
        current_uid,
        current_email,
        is_admin_user,
        picks_updated,
        CASE 
            WHEN picks_updated > 0 THEN 'Success: Updated ' || picks_updated || ' picks'
            ELSE 'No picks found to update'
        END as operation_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_toggle_picks_leaderboard_visibility(UUID, INTEGER, INTEGER, BOOLEAN) TO authenticated;