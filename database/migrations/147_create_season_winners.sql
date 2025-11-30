-- Migration 147: Create Season Winners Table
--
-- PURPOSE: Track winners and payouts for each season
--
-- FEATURES:
-- - Store bracket winners (manually set by admin)
-- - Auto-calculate point/lock/best finish winners at season end
-- - Track payout percentages for each winner category

DO $$
BEGIN
    RAISE NOTICE '🏆 Migration 147: CREATE SEASON WINNERS TABLE';
    RAISE NOTICE '================================================';
    RAISE NOTICE 'Creating season_winners table for tracking payouts';
    RAISE NOTICE '';
END;
$$;

-- Create season_winners table
CREATE TABLE IF NOT EXISTS public.season_winners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season INTEGER NOT NULL,

    -- Point winners (calculated)
    point_winner_user_id UUID REFERENCES public.users(id),
    point_second_user_id UUID REFERENCES public.users(id),
    point_third_user_id UUID REFERENCES public.users(id),
    point_fourth_user_id UUID REFERENCES public.users(id),
    point_fifth_user_id UUID REFERENCES public.users(id),
    point_sixth_user_id UUID REFERENCES public.users(id),
    point_seventh_user_id UUID REFERENCES public.users(id),
    point_eighth_user_id UUID REFERENCES public.users(id),
    point_ninth_user_id UUID REFERENCES public.users(id),
    point_tenth_user_id UUID REFERENCES public.users(id),

    -- Lock winners (calculated)
    lock_winner_user_id UUID REFERENCES public.users(id),
    lock_second_user_id UUID REFERENCES public.users(id),

    -- Bracket winners (manual admin entry)
    bracket_winner_user_id UUID REFERENCES public.users(id),
    bracket_second_user_id UUID REFERENCES public.users(id),

    -- Best Finish winner (calculated)
    best_finish_user_id UUID REFERENCES public.users(id),

    -- Weekly winner tracking (can be JSONB array of {week, user_id})
    weekly_winners JSONB DEFAULT '[]'::jsonb,

    -- Metadata
    total_pot DECIMAL(10,2),
    weekly_payout DECIMAL(10,2) DEFAULT 80.00,
    is_finalized BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Ensure one row per season
    UNIQUE(season)
);

-- Add comments
COMMENT ON TABLE public.season_winners IS 'Tracks winners and payouts for each season';
COMMENT ON COLUMN public.season_winners.weekly_winners IS 'JSONB array of weekly winners: [{"week": 1, "user_id": "uuid"}]';
COMMENT ON COLUMN public.season_winners.total_pot IS 'Total prize pool for the season';
COMMENT ON COLUMN public.season_winners.is_finalized IS 'Whether the season payouts are final and locked';

-- Enable RLS
ALTER TABLE public.season_winners ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Everyone can view winners
CREATE POLICY "Anyone can view season winners"
    ON public.season_winners
    FOR SELECT
    USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Only admins can manage season winners"
    ON public.season_winners
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_season_winners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_season_winners_timestamp
    BEFORE UPDATE ON public.season_winners
    FOR EACH ROW
    EXECUTE FUNCTION update_season_winners_updated_at();

-- Create helper function to get or create season winners row
CREATE OR REPLACE FUNCTION get_or_create_season_winners(p_season INTEGER)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    -- Try to get existing row
    SELECT id INTO v_id
    FROM public.season_winners
    WHERE season = p_season;

    -- If not found, create it
    IF v_id IS NULL THEN
        INSERT INTO public.season_winners (season)
        VALUES (p_season)
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_or_create_season_winners IS 'Gets existing or creates new season_winners row for a given season';

-- Verify the table was created
DO $$
DECLARE
    table_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'season_winners'
    ) INTO table_exists;

    IF table_exists THEN
        RAISE NOTICE '✅ season_winners table created successfully';
    ELSE
        RAISE WARNING '⚠️  Failed to create season_winners table';
    END IF;

    RAISE NOTICE '';
    RAISE NOTICE '📊 PAYOUT STRUCTURE:';
    RAISE NOTICE 'Point Winner = 32%% of pot (minus weekly)';
    RAISE NOTICE 'Point Second = 20%%';
    RAISE NOTICE 'Point Third = 12%%';
    RAISE NOTICE 'Point Fourth = 8%%';
    RAISE NOTICE 'Point Fifth = 5.5%%';
    RAISE NOTICE 'Point Sixth = 4%%';
    RAISE NOTICE 'Point Seventh = 3%%';
    RAISE NOTICE 'Point Eighth = 2.5%%';
    RAISE NOTICE 'Point Ninth = 2%%';
    RAISE NOTICE 'Point Tenth = 1.5%%';
    RAISE NOTICE 'Lock Winner = 4.5%%';
    RAISE NOTICE 'Lock Second = 1.5%%';
    RAISE NOTICE 'Bracket Winner = 2%%';
    RAISE NOTICE 'Bracket Second = 0.5%%';
    RAISE NOTICE 'Best Finish = 1%%';
    RAISE NOTICE 'Weekly Winner = $80 per week';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Migration 147 COMPLETED!';
    RAISE NOTICE '';
END;
$$;
