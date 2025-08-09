-- Temporarily disable the problematic trigger to allow auth signup to work
-- We'll handle user creation manually in the app

-- Drop the trigger that's causing issues
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Keep the function but make it more robust
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create user record if it doesn't already exist
    IF NOT EXISTS(SELECT 1 FROM public.users WHERE email = NEW.email OR id = NEW.id) THEN
        INSERT INTO public.users (id, email, display_name)
        VALUES (
            NEW.id, 
            NEW.email, 
            COALESCE(
                NEW.raw_user_meta_data->>'display_name', 
                split_part(NEW.email, '@', 1)
            )
        );
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Don't fail auth signup if user creation fails
        RAISE WARNING 'Error in handle_new_user: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: We're not recreating the trigger yet - will do manually after testing