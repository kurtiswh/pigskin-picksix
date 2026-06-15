# 🚨 IMMEDIATE FIX for Timeout Issues

Since the functions are still timing out, let's use direct SQL updates that bypass the complex functions entirely.

## Option 1: Direct SQL Update (RECOMMENDED)

This approach uses simple UPDATE statements that should complete quickly:

1. Go to **Supabase Dashboard** → **SQL Editor** → **New Query**
2. Copy the entire contents of `direct_fix_timeouts.sql`
3. Execute the query
4. This will:
   - Calculate game statistics directly
   - Update picks in simple batches
   - Show you the results

## Option 2: Extended Timeout

If you prefer to use the existing functions with a longer timeout:

1. Go to **Supabase Dashboard** → **SQL Editor** → **New Query**
2. Copy the entire contents of `fix_with_extended_timeout.sql`
3. Execute the query
4. This temporarily increases the timeout to 5 minutes for just this session

## Option 3: Manual Game-by-Game Processing

If both above options fail, process each game's picks separately:

### For Virginia Tech @ South Carolina:
```sql
-- First, ensure game stats are calculated
UPDATE games 
SET 
    winner_against_spread = CASE 
        WHEN ABS((home_score - away_score) + spread) < 0.5 THEN 'push'
        WHEN (home_score - away_score) + spread > 0 THEN home_team
        ELSE away_team
    END,
    margin_bonus = CASE 
        WHEN ABS((home_score - away_score) + spread) < 0.5 THEN 0
        WHEN ABS((home_score - away_score) + spread) >= 29 THEN 5
        WHEN ABS((home_score - away_score) + spread) >= 20 THEN 3
        WHEN ABS((home_score - away_score) + spread) >= 11 THEN 1
        ELSE 0
    END
WHERE season = 2025 
AND week = 1
AND home_team = 'South Carolina' 
AND away_team = 'Virginia Tech';

-- Then update picks (run this as a separate query if needed)
WITH game_info AS (
    SELECT id, winner_against_spread, margin_bonus
    FROM games 
    WHERE season = 2025 AND week = 1
    AND home_team = 'South Carolina' AND away_team = 'Virginia Tech'
)
UPDATE picks p
SET 
    result = CASE 
        WHEN p.selected_team = g.winner_against_spread THEN 'win'::pick_result
        WHEN g.winner_against_spread = 'push' THEN 'push'::pick_result
        ELSE 'loss'::pick_result
    END,
    points_earned = CASE 
        WHEN p.selected_team = g.winner_against_spread THEN 
            20 + COALESCE(g.margin_bonus, 0) + 
            CASE WHEN p.is_lock THEN COALESCE(g.margin_bonus, 0) ELSE 0 END
        WHEN g.winner_against_spread = 'push' THEN 10
        ELSE 0
    END
FROM game_info g
WHERE p.game_id = g.id;
```

### For Notre Dame @ Miami:
```sql
-- First, ensure game stats are calculated
UPDATE games 
SET 
    winner_against_spread = CASE 
        WHEN ABS((home_score - away_score) + spread) < 0.5 THEN 'push'
        WHEN (home_score - away_score) + spread > 0 THEN home_team
        ELSE away_team
    END,
    margin_bonus = CASE 
        WHEN ABS((home_score - away_score) + spread) < 0.5 THEN 0
        WHEN ABS((home_score - away_score) + spread) >= 29 THEN 5
        WHEN ABS((home_score - away_score) + spread) >= 20 THEN 3
        WHEN ABS((home_score - away_score) + spread) >= 11 THEN 1
        ELSE 0
    END
WHERE season = 2025 
AND week = 1
AND home_team = 'Miami' 
AND away_team = 'Notre Dame';

-- Then update picks
WITH game_info AS (
    SELECT id, winner_against_spread, margin_bonus
    FROM games 
    WHERE season = 2025 AND week = 1
    AND home_team = 'Miami' AND away_team = 'Notre Dame'
)
UPDATE picks p
SET 
    result = CASE 
        WHEN p.selected_team = g.winner_against_spread THEN 'win'::pick_result
        WHEN g.winner_against_spread = 'push' THEN 'push'::pick_result
        ELSE 'loss'::pick_result
    END,
    points_earned = CASE 
        WHEN p.selected_team = g.winner_against_spread THEN 
            20 + COALESCE(g.margin_bonus, 0) + 
            CASE WHEN p.is_lock THEN COALESCE(g.margin_bonus, 0) ELSE 0 END
        WHEN g.winner_against_spread = 'push' THEN 10
        ELSE 0
    END
FROM game_info g
WHERE p.game_id = g.id;
```

## Why These Games Are Problematic

These two games likely have:
1. The highest number of user picks (popular matchups)
2. The highest number of anonymous picks
3. Complex scoring calculations with margin bonuses and lock picks

The direct SQL approach avoids:
- Function call overhead
- Complex transaction management
- Nested queries and calculations

## After Running the Fix

1. Check that picks have been updated by running:
```sql
SELECT 
    g.away_team || ' @ ' || g.home_team as game,
    COUNT(p.id) as picks_scored,
    SUM(CASE WHEN p.result = 'win' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN p.result = 'loss' THEN 1 ELSE 0 END) as losses
FROM games g
LEFT JOIN picks p ON p.game_id = g.id
WHERE g.season = 2025 AND g.week = 1
AND g.status = 'completed'
AND p.result IS NOT NULL
GROUP BY g.id, g.away_team, g.home_team
ORDER BY g.kickoff_time;
```

2. Then run the leaderboard recalculation from the Admin Dashboard