# Apply Migrations 119 & 120: Fix Pick Results for Incomplete Games

## Issue
Non-completed games have:
1. `winner_against_spread` and `margin_bonus` set incorrectly 
2. Pick results (`result` and `points_earned`) calculated when they shouldn't be

## Root Cause
The database function was calculating winners for games that "should be completed" based on time, which then triggered pick result calculations.

## Solution
**Migration 119**: Remove winner calculation from database function entirely
**Migration 120**: Create cleanup function to fix incorrect pick results

## Steps to Apply

### 1. Go to Supabase SQL Editor

### 2. Run Migration 119 (Remove Database Winner Calculation)
Copy and run: `database/migrations/119_remove_database_winner_calculation.sql`

### 3. Run Migration 120 (Create Pick Cleanup Function)  
Copy and run: `database/migrations/120_fix_picks_for_incomplete_games.sql`

### 4. Execute the Cleanup Function
Run this query to fix the current data:
```sql
SELECT * FROM fix_picks_for_incomplete_games();
```

Or for a specific week:
```sql
SELECT * FROM fix_picks_for_incomplete_games(2025, 2);
```

## Expected Results
- ✅ Non-completed games will have NULL for `winner_against_spread`, `margin_bonus`, `base_points`
- ✅ Picks for non-completed games will have NULL for `result` and `points_earned`  
- ✅ Only completed games will have winner data and pick results
- ✅ Future games won't get premature calculations

## Verification Query
After running, verify the fix:
```sql
SELECT 
    g.home_team, g.away_team, g.status, 
    g.winner_against_spread, g.margin_bonus,
    COUNT(p.result) as picks_with_results,
    COUNT(ap.result) as anon_picks_with_results
FROM games g
LEFT JOIN picks p ON g.id = p.game_id
LEFT JOIN anonymous_picks ap ON g.id = ap.game_id  
WHERE g.season = 2025 AND g.week = 2
GROUP BY g.id, g.home_team, g.away_team, g.status, g.winner_against_spread, g.margin_bonus
ORDER BY g.status, g.home_team;
```

Should show:
- `completed` games: Can have winner data and pick results
- `in_progress` and `scheduled` games: Should have NULL winner data and 0 pick results