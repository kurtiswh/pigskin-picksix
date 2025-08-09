-- Emergency fix for LeagueSafe upload issues
-- Run this in your Supabase SQL editor

-- Step 1: Remove the problematic foreign key constraint on users table
DO $$ 
BEGIN
    -- Drop the foreign key constraint that's preventing user creation
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'users_id_fkey' 
        AND table_name = 'users'
    ) THEN
        ALTER TABLE public.users DROP CONSTRAINT users_id_fkey;
        RAISE NOTICE 'Dropped problematic users_id_fkey constraint';
    ELSE
        RAISE NOTICE 'users_id_fkey constraint not found';
    END IF;
END $$;

-- Step 2: Create the leaguesafe_payments table
CREATE TABLE IF NOT EXISTS public.leaguesafe_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    season INTEGER NOT NULL,
    leaguesafe_owner_name TEXT NOT NULL,
    leaguesafe_email TEXT NOT NULL,
    leaguesafe_owner_id TEXT,
    entry_fee DECIMAL(10,2) DEFAULT 0,
    paid DECIMAL(10,2) DEFAULT 0,
    pending DECIMAL(10,2) DEFAULT 0,
    owes DECIMAL(10,2) DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('Paid', 'NotPaid', 'Pending')) DEFAULT 'NotPaid',
    is_matched BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Add unique constraint to prevent duplicate entries per user per season
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_user_season'
        AND table_name = 'leaguesafe_payments'
    ) THEN
        ALTER TABLE public.leaguesafe_payments 
        ADD CONSTRAINT unique_user_season UNIQUE (user_id, season);
        RAISE NOTICE 'Added unique_user_season constraint';
    END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_season ON public.leaguesafe_payments(season);
CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_status ON public.leaguesafe_payments(status);
CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_email ON public.leaguesafe_payments(leaguesafe_email);
CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_matched ON public.leaguesafe_payments(is_matched);
CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_user_id ON public.leaguesafe_payments(user_id);

-- Enable RLS
ALTER TABLE public.leaguesafe_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Admin users can manage leaguesafe payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "Users can view their own payment status" ON public.leaguesafe_payments;

CREATE POLICY "Admin users can manage leaguesafe payments" ON public.leaguesafe_payments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() AND users.is_admin = true
        )
    );

CREATE POLICY "Users can view their own payment status" ON public.leaguesafe_payments
    FOR SELECT USING (user_id = auth.uid());

-- Add comments
COMMENT ON TABLE public.leaguesafe_payments IS 'Tracks yearly LeagueSafe payment status for users';
COMMENT ON COLUMN public.leaguesafe_payments.user_id IS 'Reference to the user (null if unmatched)';
COMMENT ON COLUMN public.leaguesafe_payments.season IS 'Year of the payment';
COMMENT ON COLUMN public.leaguesafe_payments.is_matched IS 'Whether this payment has been matched to a user';
COMMENT ON COLUMN public.leaguesafe_payments.status IS 'Payment status from LeagueSafe (Paid, NotPaid, Pending)';

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_leaguesafe_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for automatic updated_at
DROP TRIGGER IF EXISTS update_leaguesafe_payments_updated_at ON public.leaguesafe_payments;
CREATE TRIGGER update_leaguesafe_payments_updated_at
    BEFORE UPDATE ON public.leaguesafe_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_leaguesafe_payments_updated_at();

-- Step 3: Test that user creation now works
DO $$
DECLARE
    test_id UUID := gen_random_uuid();
    test_email TEXT := 'migration-test-' || extract(epoch from now()) || '@example.com';
BEGIN
    -- Try to insert a test user
    INSERT INTO public.users (id, email, display_name, is_admin)
    VALUES (test_id, test_email, 'Migration Test User', false);
    
    -- Clean up the test user
    DELETE FROM public.users WHERE id = test_id;
    
    RAISE NOTICE 'User creation test passed - foreign key constraint is fixed';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'User creation test failed: %', SQLERRM;
END $$;

-- Verify the table was created
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'leaguesafe_payments' 
        AND table_schema = 'public'
    ) THEN
        RAISE NOTICE 'leaguesafe_payments table created successfully';
    ELSE
        RAISE NOTICE 'ERROR: leaguesafe_payments table was not created';
    END IF;
END $$;