-- Ensure missing game fields exist in production
-- Fixes: Save failed: Could not find the 'neutral_site' column

-- Add missing columns to games table (safe to run multiple times)
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS neutral_site BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS home_team_ranking INTEGER,
ADD COLUMN IF NOT EXISTS away_team_ranking INTEGER,
ADD COLUMN IF NOT EXISTS venue TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.games.neutral_site IS 'True if game is played at neutral site (shows "vs" instead of "@")';
COMMENT ON COLUMN public.games.home_team_ranking IS 'AP/Coaches poll ranking for home team (1-25, null if unranked)';
COMMENT ON COLUMN public.games.away_team_ranking IS 'AP/Coaches poll ranking for away team (1-25, null if unranked)';
COMMENT ON COLUMN public.games.venue IS 'Stadium or venue name where game is played';

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_games_rankings ON public.games(home_team_ranking, away_team_ranking) WHERE home_team_ranking IS NOT NULL OR away_team_ranking IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_neutral_site ON public.games(neutral_site) WHERE neutral_site = true;

-- Verify columns exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'neutral_site') THEN
        RAISE NOTICE 'SUCCESS: neutral_site column exists';
    ELSE
        RAISE EXCEPTION 'FAILED: neutral_site column missing';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'venue') THEN
        RAISE NOTICE 'SUCCESS: venue column exists';
    ELSE
        RAISE EXCEPTION 'FAILED: venue column missing';
    END IF;
END $$;