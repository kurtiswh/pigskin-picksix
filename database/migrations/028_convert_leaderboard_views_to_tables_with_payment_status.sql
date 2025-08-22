-- Migration: Convert leaderboard views to tables and add payment status tracking
-- This enables trigger-based real-time updates and eliminates the need for complex joins

-- Step 1: Drop existing views
DROP VIEW IF EXISTS public.weekly_leaderboard CASCADE;
DROP VIEW IF EXISTS public.season_leaderboard CASCADE;

-- Step 2: Create weekly_leaderboard as a table with payment status
CREATE TABLE public.weekly_leaderboard (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    week INTEGER NOT NULL,
    season INTEGER NOT NULL,
    picks_made INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    pushes INTEGER DEFAULT 0,
    lock_wins INTEGER DEFAULT 0,
    lock_losses INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    weekly_rank INTEGER,
    
    -- Payment status columns (the key addition)
    payment_status TEXT DEFAULT 'NotPaid' CHECK (payment_status IN ('Paid', 'NotPaid', 'Pending')),
    is_verified BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_weekly_leaderboard_user_week UNIQUE (user_id, week, season)
);

-- Step 3: Create season_leaderboard as a table with payment status
CREATE TABLE public.season_leaderboard (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    season INTEGER NOT NULL,
    total_picks INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    total_pushes INTEGER DEFAULT 0,
    lock_wins INTEGER DEFAULT 0,
    lock_losses INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    season_rank INTEGER,
    
    -- Payment status columns (the key addition)
    payment_status TEXT DEFAULT 'NotPaid' CHECK (payment_status IN ('Paid', 'NotPaid', 'Pending')),
    is_verified BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_season_leaderboard_user UNIQUE (user_id, season)
);

-- Step 4: Create indexes for performance
CREATE INDEX idx_weekly_leaderboard_week_season ON public.weekly_leaderboard(week, season);
CREATE INDEX idx_weekly_leaderboard_is_verified ON public.weekly_leaderboard(is_verified);
CREATE INDEX idx_weekly_leaderboard_payment_status ON public.weekly_leaderboard(payment_status);
CREATE INDEX idx_weekly_leaderboard_total_points ON public.weekly_leaderboard(total_points DESC);
CREATE INDEX idx_weekly_leaderboard_rank ON public.weekly_leaderboard(weekly_rank);

CREATE INDEX idx_season_leaderboard_season ON public.season_leaderboard(season);
CREATE INDEX idx_season_leaderboard_is_verified ON public.season_leaderboard(is_verified);
CREATE INDEX idx_season_leaderboard_payment_status ON public.season_leaderboard(payment_status);
CREATE INDEX idx_season_leaderboard_total_points ON public.season_leaderboard(total_points DESC);
CREATE INDEX idx_season_leaderboard_rank ON public.season_leaderboard(season_rank);

-- Step 5: Enable RLS
ALTER TABLE public.weekly_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_leaderboard ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies (anyone can read leaderboards)
CREATE POLICY "Anyone can view weekly leaderboard" ON public.weekly_leaderboard 
    FOR SELECT USING (true);

CREATE POLICY "Only admins can modify weekly leaderboard" ON public.weekly_leaderboard 
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
    );

CREATE POLICY "Anyone can view season leaderboard" ON public.season_leaderboard 
    FOR SELECT USING (true);

CREATE POLICY "Only admins can modify season leaderboard" ON public.season_leaderboard 
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
    );

-- Step 7: Add trigger for updated_at timestamp
CREATE TRIGGER update_weekly_leaderboard_updated_at 
    BEFORE UPDATE ON public.weekly_leaderboard
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_season_leaderboard_updated_at 
    BEFORE UPDATE ON public.season_leaderboard
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Step 8: Populate initial data from existing picks and users
-- This will create entries for all users who have made picks, with payment status defaulting to 'NotPaid'

-- Weekly leaderboard population
INSERT INTO public.weekly_leaderboard (
    user_id, display_name, week, season, picks_made, wins, losses, pushes, 
    lock_wins, lock_losses, total_points, payment_status, is_verified
)
SELECT 
    u.id as user_id,
    u.display_name,
    w.week,
    w.season,
    COUNT(p.id) as picks_made,
    COUNT(CASE WHEN p.result = 'win' THEN 1 END) as wins,
    COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as losses,
    COUNT(CASE WHEN p.result = 'push' THEN 1 END) as pushes,
    COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
    COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
    COALESCE(SUM(p.points_earned), 0) as total_points,
    'NotPaid' as payment_status,  -- Will be updated by payment status trigger
    FALSE as is_verified          -- Will be updated by payment status trigger
FROM public.users u
CROSS JOIN public.week_settings w
LEFT JOIN public.picks p ON u.id = p.user_id AND w.week = p.week AND w.season = p.season
GROUP BY u.id, u.display_name, w.week, w.season
HAVING COUNT(p.id) > 0;  -- Only include users who have made picks

-- Season leaderboard population
INSERT INTO public.season_leaderboard (
    user_id, display_name, season, total_picks, total_wins, total_losses, total_pushes,
    lock_wins, lock_losses, total_points, payment_status, is_verified
)
SELECT 
    u.id as user_id,
    u.display_name,
    p.season,
    COUNT(p.id) as total_picks,
    COUNT(CASE WHEN p.result = 'win' THEN 1 END) as total_wins,
    COUNT(CASE WHEN p.result = 'loss' THEN 1 END) as total_losses,
    COUNT(CASE WHEN p.result = 'push' THEN 1 END) as total_pushes,
    COUNT(CASE WHEN p.result = 'win' AND p.is_lock THEN 1 END) as lock_wins,
    COUNT(CASE WHEN p.result = 'loss' AND p.is_lock THEN 1 END) as lock_losses,
    COALESCE(SUM(p.points_earned), 0) as total_points,
    'NotPaid' as payment_status,  -- Will be updated by payment status trigger
    FALSE as is_verified          -- Will be updated by payment status trigger
FROM public.users u
LEFT JOIN public.picks p ON u.id = p.user_id
WHERE p.season IS NOT NULL
GROUP BY u.id, u.display_name, p.season;

-- Step 9: Update rankings
-- Weekly rankings
UPDATE public.weekly_leaderboard 
SET weekly_rank = subq.rank
FROM (
    SELECT id, RANK() OVER (PARTITION BY week, season ORDER BY total_points DESC) as rank
    FROM public.weekly_leaderboard
) subq
WHERE public.weekly_leaderboard.id = subq.id;

-- Season rankings
UPDATE public.season_leaderboard 
SET season_rank = subq.rank
FROM (
    SELECT id, RANK() OVER (PARTITION BY season ORDER BY total_points DESC) as rank
    FROM public.season_leaderboard
) subq
WHERE public.season_leaderboard.id = subq.id;

-- Add comments
COMMENT ON TABLE public.weekly_leaderboard IS 'Materialized weekly leaderboard data with payment status for real-time updates';
COMMENT ON TABLE public.season_leaderboard IS 'Materialized season leaderboard data with payment status for real-time updates';
COMMENT ON COLUMN public.weekly_leaderboard.payment_status IS 'Payment status from LeagueSafe (Paid, NotPaid, Pending)';
COMMENT ON COLUMN public.weekly_leaderboard.is_verified IS 'Whether user has paid and is verified for leaderboard display';
COMMENT ON COLUMN public.season_leaderboard.payment_status IS 'Payment status from LeagueSafe (Paid, NotPaid, Pending)';
COMMENT ON COLUMN public.season_leaderboard.is_verified IS 'Whether user has paid and is verified for leaderboard display';