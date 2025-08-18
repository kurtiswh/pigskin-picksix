-- Enhanced user trigger that includes LeagueSafe payment matching
-- This ensures any auth account creation method automatically links payments

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    payment_record RECORD;
    payments_linked INTEGER := 0;
BEGIN
    -- Check if this is a first-time setup (skip_user_creation flag)
    IF (NEW.raw_user_meta_data->>'skip_user_creation')::boolean IS TRUE THEN
        -- Don't create a new user record, it should already exist
        RAISE LOG 'Skipping user creation for first-time setup: %', NEW.email;
        RETURN NEW;
    END IF;
    
    -- Check if user record already exists (shouldn't happen, but safety check)
    IF EXISTS(SELECT 1 FROM public.users WHERE email = NEW.email) THEN
        -- User already exists, don't create duplicate
        RAISE LOG 'User already exists, skipping creation: %', NEW.email;
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
    
    RAISE LOG 'Created user record for: %', NEW.email;
    
    -- Link LeagueSafe payments with matching email
    FOR payment_record IN 
        SELECT id, season FROM public.leaguesafe_payments 
        WHERE leaguesafe_email = NEW.email 
        AND is_matched = false
    LOOP
        UPDATE public.leaguesafe_payments 
        SET user_id = NEW.id, is_matched = true
        WHERE id = payment_record.id;
        
        payments_linked := payments_linked + 1;
        RAISE LOG 'Linked LeagueSafe payment for season % to user %', payment_record.season, NEW.email;
    END LOOP;
    
    IF payments_linked > 0 THEN
        RAISE LOG 'Successfully linked % LeagueSafe payments for user %', payments_linked, NEW.email;
    ELSE
        RAISE LOG 'No unmatched LeagueSafe payments found for user %', NEW.email;
    END IF;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        -- Log the error and continue (don't fail the auth signup)
        RAISE WARNING 'Error in handle_new_user trigger for %: %', NEW.email, SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Add comment
COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates user records and links LeagueSafe payments when auth users are created';