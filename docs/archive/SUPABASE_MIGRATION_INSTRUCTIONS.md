# Winner Against Spread Migration Instructions

You need to run this SQL migration in your Supabase Dashboard to add the winner against spread column and recalculate all points.

## Steps:

1. Go to your Supabase Dashboard → SQL Editor
2. Copy and paste the SQL below
3. Click "Run" to execute the migration

## SQL Migration:

```sql
-- Step 1: Add winner_against_spread, favorite_team, and ranking columns to games table
ALTER TABLE public.games 
ADD COLUMN IF NOT EXISTS winner_against_spread TEXT,
ADD COLUMN IF NOT EXISTS favorite_team TEXT,
ADD COLUMN IF NOT EXISTS home_team_ranking INTEGER,
ADD COLUMN IF NOT EXISTS away_team_ranking INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN public.games.winner_against_spread IS 'Team that won against the spread: home team name, away team name, or "push"';
COMMENT ON COLUMN public.games.favorite_team IS 'Team that is favored to win (has negative spread applied to them)';
COMMENT ON COLUMN public.games.home_team_ranking IS 'AP/Coaches Poll ranking for home team (1-25, NULL if unranked)';
COMMENT ON COLUMN public.games.away_team_ranking IS 'AP/Coaches Poll ranking for away team (1-25, NULL if unranked)';

-- Step 2: Calculate favorite team for ALL games (including future 2025+ games)
UPDATE public.games 
SET favorite_team = CASE 
    WHEN spread < 0 THEN home_team  -- Negative spread = home team favored
    WHEN spread > 0 THEN away_team  -- Positive spread = away team favored  
    ELSE NULL -- Pick 'em game
END;

-- Step 3: Update winner against spread for completed games only
UPDATE public.games 
SET winner_against_spread = CASE 
    WHEN home_score IS NULL OR away_score IS NULL THEN NULL
    WHEN spread < 0 THEN  -- Home team favored
        CASE 
            WHEN (home_score + spread) > away_score THEN home_team
            WHEN away_score > (home_score + spread) THEN away_team
            ELSE 'push'
        END
    WHEN spread > 0 THEN  -- Away team favored
        CASE 
            WHEN home_score > (away_score + ABS(spread)) THEN home_team
            WHEN (away_score + ABS(spread)) > home_score THEN away_team
            ELSE 'push'
        END
    ELSE  -- Pick 'em game (spread = 0)
        CASE 
            WHEN home_score > away_score THEN home_team
            WHEN away_score > home_score THEN away_team
            ELSE 'push'
        END
END
WHERE status = 'completed';

-- Step 4: Update games table margin bonus with corrected calculation
UPDATE public.games 
SET margin_bonus = CASE 
    WHEN winner_against_spread = 'push' OR winner_against_spread IS NULL THEN 0
    WHEN spread < 0 THEN  -- Home team favored
        CASE 
            WHEN winner_against_spread = home_team THEN
                CASE 
                    WHEN (home_score + spread - away_score) >= 29 THEN 5
                    WHEN (home_score + spread - away_score) >= 20 THEN 3  
                    WHEN (home_score + spread - away_score) >= 11 THEN 1
                    ELSE 0
                END
            WHEN winner_against_spread = away_team THEN
                CASE 
                    WHEN (away_score - home_score - spread) >= 29 THEN 5
                    WHEN (away_score - home_score - spread) >= 20 THEN 3
                    WHEN (away_score - home_score - spread) >= 11 THEN 1  
                    ELSE 0
                END
            ELSE 0
        END
    WHEN spread > 0 THEN  -- Away team favored
        CASE 
            WHEN winner_against_spread = home_team THEN
                CASE 
                    WHEN (home_score - away_score - ABS(spread)) >= 29 THEN 5
                    WHEN (home_score - away_score - ABS(spread)) >= 20 THEN 3
                    WHEN (home_score - away_score - ABS(spread)) >= 11 THEN 1
                    ELSE 0
                END
            WHEN winner_against_spread = away_team THEN
                CASE 
                    WHEN (away_score + ABS(spread) - home_score) >= 29 THEN 5
                    WHEN (away_score + ABS(spread) - home_score) >= 20 THEN 3
                    WHEN (away_score + ABS(spread) - home_score) >= 11 THEN 1
                    ELSE 0
                END
            ELSE 0
        END
    ELSE  -- Pick 'em game
        CASE 
            WHEN winner_against_spread = home_team THEN
                CASE 
                    WHEN (home_score - away_score) >= 29 THEN 5
                    WHEN (home_score - away_score) >= 20 THEN 3
                    WHEN (home_score - away_score) >= 11 THEN 1
                    ELSE 0
                END
            WHEN winner_against_spread = away_team THEN
                CASE 
                    WHEN (away_score - home_score) >= 29 THEN 5
                    WHEN (away_score - home_score) >= 20 THEN 3
                    WHEN (away_score - home_score) >= 11 THEN 1
                    ELSE 0
                END
            ELSE 0
        END
END
WHERE status = 'completed';

-- Step 5: Recalculate all pick results and points using current scoring method
UPDATE public.picks 
SET 
    result = CASE 
        WHEN g.winner_against_spread IS NULL THEN picks.result -- Keep existing if game not completed
        WHEN g.winner_against_spread = 'push' THEN 'push'
        WHEN picks.selected_team = g.winner_against_spread THEN 'win'
        ELSE 'loss'
    END::pick_result,
    points_earned = CASE 
        WHEN g.winner_against_spread IS NULL THEN picks.points_earned -- Keep existing if game not completed
        WHEN g.winner_against_spread = 'push' THEN 10
        WHEN picks.selected_team = g.winner_against_spread THEN 
            -- Win: 20 base points + margin bonus (doubled for locks)
            20 + CASE 
                WHEN picks.is_lock THEN g.margin_bonus * 2
                ELSE g.margin_bonus
            END
        ELSE 0 -- Loss
    END
FROM public.games g
WHERE picks.game_id = g.id;

-- Step 6: Create trigger to automatically set favorite_team for new games
CREATE OR REPLACE FUNCTION set_favorite_team_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Set favorite team based on spread
    NEW.favorite_team := CASE 
        WHEN NEW.spread < 0 THEN NEW.home_team  -- Negative spread = home team favored
        WHEN NEW.spread > 0 THEN NEW.away_team  -- Positive spread = away team favored  
        ELSE NULL -- Pick 'em game
    END;
    
    RETURN NEW;
END;
$$;

-- Create trigger for new game inserts
DROP TRIGGER IF EXISTS set_favorite_team_trigger ON public.games;
CREATE TRIGGER set_favorite_team_trigger
    BEFORE INSERT ON public.games
    FOR EACH ROW
    EXECUTE FUNCTION set_favorite_team_on_insert();

-- Step 7: Create indexes for performance on the new columns
CREATE INDEX IF NOT EXISTS idx_games_winner_against_spread ON public.games(winner_against_spread);
CREATE INDEX IF NOT EXISTS idx_games_favorite_team ON public.games(favorite_team);
CREATE INDEX IF NOT EXISTS idx_games_rankings ON public.games(home_team_ranking, away_team_ranking);

-- Step 8: Show verification query results
SELECT 
    'Migration Results' as status,
    (SELECT COUNT(*) FROM public.games WHERE winner_against_spread IS NOT NULL) as games_with_winner,
    (SELECT COUNT(*) FROM public.picks WHERE points_earned IS NOT NULL) as picks_with_points;

-- Step 9: Show sample of games with winner against spread
SELECT 
    home_team || ' vs ' || away_team as matchup,
    CASE 
        WHEN home_score IS NOT NULL AND away_score IS NOT NULL 
        THEN home_score || '-' || away_score 
        ELSE 'Not completed' 
    END as final_score,
    spread,
    favorite_team,
    winner_against_spread,
    margin_bonus
FROM public.games 
WHERE winner_against_spread IS NOT NULL 
ORDER BY updated_at DESC 
LIMIT 10;
```

## What This Migration Does:

1. **Adds `winner_against_spread` and `favorite_team` columns** to the games table
2. **Calculates favorite team for ALL games** (including future 2025+ games) based on spread:
   - **Negative spread** → Home team is favored
   - **Positive spread** → Away team is favored
   - **Zero spread** → Pick 'em game
3. **Calculates winner against spread** for completed games only using proper logic:
   - **Home team favored** (negative spread): Winner = team that covers `(home_score + spread) vs away_score`
   - **Away team favored** (positive spread): Winner = team that covers `home_score vs (away_score + abs(spread))`
   - **Pick 'em** (zero spread): Winner = team with higher score
4. **Recalculates margin bonuses** using the correct formula based on how much the winner beat the spread by
5. **Recalculates all pick points** using the current scoring method:
   - **Win**: 20 base points + margin bonus
   - **Push**: 10 points
   - **Loss**: 0 points
   - **Lock picks**: Double the margin bonus (not the base points)
6. **Creates trigger for future games** to automatically set favorite_team when new games are inserted
7. **Margin bonuses**: +1 (11-19.5 point margin), +3 (20-28.5), +5 (29+)

## After Running:

The migration will show you:
- How many games now have a winner against spread (completed games only)
- How many picks have recalculated points
- A sample of 10 games showing the favorite team and winner against spread

## For 2025 and Beyond:

✅ **Any new games inserted** will automatically have `favorite_team` calculated based on the spread
✅ **You'll instantly see who is favored** even before games are played
✅ **Winner against spread** will be calculated automatically once scores are added

Now you'll be able to easily see who is favored and who won against the spread for each game, and all points will be calculated using the consistent scoring method!