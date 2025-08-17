-- Add scoring calculation fields to games table
-- This will store the points earned for each outcome without needing complex calculations

-- Add base_points field (20 points for winning pick)
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS base_points INTEGER DEFAULT 20;

-- Add margin_bonus field (bonus points based on margin of victory)
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS margin_bonus INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN public.games.base_points IS 'Base points awarded for correct pick (usually 20)';
COMMENT ON COLUMN public.games.margin_bonus IS 'Bonus points based on margin of victory (1-5 points)';

-- Create function to calculate margin bonus based on point difference
-- Bonus: +1 (11-19.5), +3 (20-28.5), +5 (29+)
CREATE OR REPLACE FUNCTION calculate_margin_bonus(home_score INTEGER, away_score INTEGER, spread NUMERIC)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    point_difference NUMERIC;
    margin NUMERIC;
BEGIN
    -- Return 0 if game not completed
    IF home_score IS NULL OR away_score IS NULL THEN
        RETURN 0;
    END IF;
    
    -- Calculate the actual margin vs spread
    point_difference := ABS((home_score - away_score) - spread);
    margin := point_difference;
    
    -- Award bonus based on margin ranges
    IF margin >= 29 THEN
        RETURN 5;
    ELSIF margin >= 20 THEN
        RETURN 3;
    ELSIF margin >= 11 THEN
        RETURN 1;
    ELSE
        RETURN 0;
    END IF;
END;
$$;

-- Create trigger to automatically calculate margin bonus when scores are updated
CREATE OR REPLACE FUNCTION update_game_scoring()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update margin bonus when scores change
    NEW.margin_bonus := calculate_margin_bonus(NEW.home_score, NEW.away_score, NEW.spread);
    
    RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS update_game_scoring_trigger ON public.games;
CREATE TRIGGER update_game_scoring_trigger
    BEFORE UPDATE ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION update_game_scoring();

-- Update existing completed games to have proper scoring
UPDATE public.games 
SET margin_bonus = calculate_margin_bonus(home_score, away_score, spread)
WHERE home_score IS NOT NULL AND away_score IS NOT NULL;