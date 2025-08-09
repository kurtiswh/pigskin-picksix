-- Migration to fix foreign key constraints and implement multi-email user system
-- This addresses the "users_id_fkey" constraint error and allows multiple emails per user

-- Step 1: Check and fix any problematic foreign key constraints on users table
DO $$ 
BEGIN
    -- Drop any problematic foreign key constraints that might be circular
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'users_id_fkey' 
        AND table_name = 'users'
    ) THEN
        ALTER TABLE public.users DROP CONSTRAINT users_id_fkey;
        RAISE NOTICE 'Dropped problematic users_id_fkey constraint';
    END IF;
END $$;

-- Step 2: Create user_emails table to support multiple emails per user
CREATE TABLE IF NOT EXISTS public.user_emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    email_type TEXT NOT NULL CHECK (email_type IN ('primary', 'leaguesafe', 'alternate')) DEFAULT 'alternate',
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Add unique constraint to prevent duplicate emails
ALTER TABLE public.user_emails 
ADD CONSTRAINT unique_email UNIQUE (email);

-- Add index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_user_emails_email ON public.user_emails(email);
CREATE INDEX IF NOT EXISTS idx_user_emails_user_id ON public.user_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_user_emails_type ON public.user_emails(email_type);

-- Step 3: Migrate existing user emails to the new table
INSERT INTO public.user_emails (user_id, email, email_type, is_verified)
SELECT 
    id as user_id,
    email,
    'primary' as email_type,
    true as is_verified
FROM public.users 
WHERE email IS NOT NULL
ON CONFLICT (email) DO NOTHING;

-- Also migrate leaguesafe_email if it exists and is different
INSERT INTO public.user_emails (user_id, email, email_type, is_verified)
SELECT 
    id as user_id,
    leaguesafe_email,
    'leaguesafe' as email_type,
    false as is_verified
FROM public.users 
WHERE leaguesafe_email IS NOT NULL 
AND leaguesafe_email != email
ON CONFLICT (email) DO NOTHING;

-- Step 4: Create function to find user by any email
CREATE OR REPLACE FUNCTION find_user_by_any_email(search_email TEXT)
RETURNS UUID AS $$
DECLARE
    found_user_id UUID;
BEGIN
    -- First try to find by any email in user_emails table
    SELECT user_id INTO found_user_id
    FROM public.user_emails
    WHERE email = search_email
    LIMIT 1;
    
    -- If not found, check users table directly (fallback)
    IF found_user_id IS NULL THEN
        SELECT id INTO found_user_id
        FROM public.users
        WHERE email = search_email OR leaguesafe_email = search_email
        LIMIT 1;
    END IF;
    
    RETURN found_user_id;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create function to add email to user
CREATE OR REPLACE FUNCTION add_email_to_user(p_user_id UUID, p_email TEXT, p_email_type TEXT DEFAULT 'alternate')
RETURNS BOOLEAN AS $$
BEGIN
    INSERT INTO public.user_emails (user_id, email, email_type, is_verified)
    VALUES (p_user_id, p_email, p_email_type, false)
    ON CONFLICT (email) DO NOTHING;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Enable RLS on user_emails
ALTER TABLE public.user_emails ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_emails
CREATE POLICY "Users can view their own emails" ON public.user_emails
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admins can view all emails" ON public.user_emails
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() AND users.is_admin = true
        )
    );

CREATE POLICY "Admins can manage all emails" ON public.user_emails
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() AND users.is_admin = true
        )
    );

-- Step 7: Create updated_at trigger for user_emails
CREATE OR REPLACE FUNCTION update_user_emails_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_user_emails_updated_at
    BEFORE UPDATE ON public.user_emails
    FOR EACH ROW
    EXECUTE FUNCTION update_user_emails_updated_at();

-- Step 8: Create view for easy user + email queries
CREATE OR REPLACE VIEW public.users_with_emails AS
SELECT 
    u.id,
    u.email as primary_email,
    u.display_name,
    u.is_admin,
    u.leaguesafe_email,
    u.created_at,
    u.updated_at,
    COALESCE(
        json_agg(
            json_build_object(
                'email', ue.email,
                'type', ue.email_type,
                'verified', ue.is_verified
            )
        ) FILTER (WHERE ue.email IS NOT NULL),
        '[]'::json
    ) as all_emails
FROM public.users u
LEFT JOIN public.user_emails ue ON u.id = ue.user_id
GROUP BY u.id, u.email, u.display_name, u.is_admin, u.leaguesafe_email, u.created_at, u.updated_at;

-- Add helpful comments
COMMENT ON TABLE public.user_emails IS 'Stores multiple email addresses per user for matching purposes';
COMMENT ON COLUMN public.user_emails.email_type IS 'Type of email: primary, leaguesafe, or alternate';
COMMENT ON FUNCTION find_user_by_any_email(TEXT) IS 'Find user ID by searching across all their email addresses';
COMMENT ON FUNCTION add_email_to_user(UUID, TEXT, TEXT) IS 'Add an additional email address to a user account';
COMMENT ON VIEW public.users_with_emails IS 'User data with all associated email addresses as JSON';