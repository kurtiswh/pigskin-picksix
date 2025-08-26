-- Add missing game fields for neutral site, rankings, and venue
-- This fixes spread display, neutral site indicators, and team ranking display

-- Add missing columns to games table
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

-- Create index for better query performance on rankings
CREATE INDEX IF NOT EXISTS idx_games_rankings ON public.games(home_team_ranking, away_team_ranking) WHERE home_team_ranking IS NOT NULL OR away_team_ranking IS NOT NULL;

-- Create index for neutral site games
CREATE INDEX IF NOT EXISTS idx_games_neutral_site ON public.games(neutral_site) WHERE neutral_site = true;