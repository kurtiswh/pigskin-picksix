-- Improve the handle_new_user trigger to avoid conflicts with existing users
-- and handle the first-time setup scenario

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if this is a first-time setup (skip_user_creation flag)
    IF (NEW.raw_user_meta_data->>'skip_user_creation')::boolean IS TRUE THEN
        -- Don't create a new user record, it should already exist
        RETURN NEW;
    END IF;
    
    -- Check if user record already exists (shouldn't happen, but safety check)
    IF EXISTS(SELECT 1 FROM public.users WHERE email = NEW.email) THEN
        -- User already exists, don't create duplicate
        RETURN NEW;
    END IF;
    
    -- Create new user record
    INSERT INTO public.users (id, email, display_name)
    VALUES (
        NEW.id, 
        NEW.email, 
        COALESCE(
            NEW.raw_user_meta_data->>'display_name', 
            split_part(NEW.email, '@', 1)
        )
    );
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and continue (don't fail the auth signup)
        RAISE WARNING 'Error in handle_new_user trigger: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();