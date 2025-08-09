-- Migration to fix the relationship between users and leaguesafe_payments
-- Run this in your Supabase SQL editor

-- First, ensure the leaguesafe_payments table exists
CREATE TABLE IF NOT EXISTS public.leaguesafe_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
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

-- Drop the foreign key constraint if it exists (to recreate it properly)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'leaguesafe_payments_user_id_fkey'
    ) THEN
        ALTER TABLE public.leaguesafe_payments 
        DROP CONSTRAINT leaguesafe_payments_user_id_fkey;
    END IF;
END $$;

-- Add the foreign key constraint properly
ALTER TABLE public.leaguesafe_payments 
ADD CONSTRAINT leaguesafe_payments_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Drop existing unique constraint if it exists
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'unique_user_season'
    ) THEN
        ALTER TABLE public.leaguesafe_payments 
        DROP CONSTRAINT unique_user_season;
    END IF;
END $$;

-- Add unique constraint to prevent duplicate entries per user per season
ALTER TABLE public.leaguesafe_payments 
ADD CONSTRAINT unique_user_season UNIQUE (user_id, season);

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_user_id ON public.leaguesafe_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_season ON public.leaguesafe_payments(season);
CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_status ON public.leaguesafe_payments(status);
CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_email ON public.leaguesafe_payments(leaguesafe_email);
CREATE INDEX IF NOT EXISTS idx_leaguesafe_payments_matched ON public.leaguesafe_payments(is_matched);

-- Enable RLS if not already enabled
ALTER TABLE public.leaguesafe_payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admin users can manage leaguesafe payments" ON public.leaguesafe_payments;
DROP POLICY IF EXISTS "Users can view their own payment status" ON public.leaguesafe_payments;

-- Recreate RLS Policies
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

-- Create or replace function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_leaguesafe_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_leaguesafe_payments_updated_at ON public.leaguesafe_payments;

-- Create trigger for automatic updated_at
CREATE TRIGGER update_leaguesafe_payments_updated_at
    BEFORE UPDATE ON public.leaguesafe_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_leaguesafe_payments_updated_at();