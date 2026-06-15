# Game Statistics Lock Counting Fix

## Problem Identified

The `scheduled_game_statistics()` function is **not counting locks properly**. Based on your screenshot showing all lock columns as 0 despite games having substantial pick counts (32, 39, 66, 198, etc.), the issue is confirmed.

## Root Cause

The current `scheduled_game_statistics()` function uses its own simplified counting logic that only tracks total picks without properly separating locks from regular picks. It overwrites the lock columns with zeros.

Here's the problematic code from the current function:
```sql
-- Current function only counts total picks, not locks separately
SELECT
    COALESCE(SUM(CASE WHEN selected_team = game_rec.home_team THEN 1 ELSE 0 END), 0)
INTO home_pick_count
FROM (
    SELECT selected_team FROM picks WHERE game_id = game_rec.id AND submitted = true
    UNION ALL
    SELECT selected_team FROM anonymous_picks WHERE game_id = game_rec.id
) combined_picks;

-- This sets home_team_locks = 0, away_team_locks = 0 (WRONG!)
UPDATE games
SET
    home_team_picks = home_pick_count,
    away_team_picks = away_pick_count,
    total_picks = total_pick_count,
    home_pick_percentage = home_percentage,
    away_pick_percentage = away_percentage
    -- Notice: no lock columns updated!
```

## The Solution

Replace the `scheduled_game_statistics()` function to use the existing comprehensive `calculate_game_pick_statistics_safe()` function instead of its own flawed counting logic.

### Fixed Function

```sql
CREATE OR REPLACE FUNCTION scheduled_game_statistics()
RETURNS TABLE(
    games_updated INTEGER,
    statistics_calculated INTEGER,
    errors TEXT[]
)
SECURITY DEFINER
LANGUAGE plpgsql AS $$
DECLARE
    games_count INTEGER := 0;
    stats_count INTEGER := 0;
    error_list TEXT[] := ARRAY[]::TEXT[];
    active_week_rec RECORD;
    game_rec RECORD;
BEGIN
    RAISE NOTICE '📊 SCHEDULED GAME STATISTICS: Starting at %', CURRENT_TIMESTAMP;

    -- Step 1: Find active week
    SELECT week, season INTO active_week_rec
    FROM week_settings
    WHERE picks_open = true
    ORDER BY week DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE NOTICE '⏳ No active week found for game statistics';
        RETURN QUERY SELECT 0, 0, ARRAY['No active week found']::TEXT[];
        RETURN;
    END IF;

    RAISE NOTICE '🎯 Calculating statistics for Week % Season %', active_week_rec.week, active_week_rec.season;

    -- Step 2: Use the comprehensive lock-aware statistics function for each game
    FOR game_rec IN
        SELECT id, home_team, away_team
        FROM games
        WHERE season = active_week_rec.season
        AND week = active_week_rec.week
    LOOP
        games_count := games_count + 1;

        BEGIN
            -- ✅ FIX: Use the existing comprehensive function that properly handles locks
            PERFORM public.calculate_game_pick_statistics_safe(game_rec.id);
            stats_count := stats_count + 1;

            RAISE NOTICE '  📊 Updated statistics for % vs %', game_rec.away_team, game_rec.home_team;

        EXCEPTION
            WHEN OTHERS THEN
                error_list := array_append(error_list,
                    format('Game %s: %s', game_rec.id, SQLERRM));
                RAISE WARNING '❌ Error updating game %: %', game_rec.id, SQLERRM;
        END;

    END LOOP;

    RAISE NOTICE '📊 Results: % games processed, % statistics calculated',
                 games_count, stats_count;

    RETURN QUERY SELECT games_count, stats_count, error_list;

EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '❌ Game statistics failed: %', SQLERRM;
        RETURN QUERY SELECT games_count, stats_count,
                           ARRAY[SQLERRM]::TEXT[];
END;
$$;
```

## How to Apply the Fix

### Option 1: Via Supabase SQL Editor
1. Open your Supabase dashboard
2. Go to SQL Editor
3. Copy and paste the fixed function code above
4. Run the query

### Option 2: Via Database Migration
1. Apply the SQL file: `fix-scheduled-game-statistics.sql`
2. This will replace the function with the lock-aware version

### Option 3: Manual Update (Immediate)
For an immediate fix without changing the scheduled function, you can manually run:

```sql
-- Update all games in a specific week using the safe function
DO $$
DECLARE
    game_record RECORD;
BEGIN
    FOR game_record IN
        SELECT id FROM games WHERE week = 14 AND season = 2024
    LOOP
        PERFORM calculate_game_pick_statistics_safe(game_record.id);
    END LOOP;
END $$;
```

## Verification

After applying the fix, lock counts should be properly displayed:

**Before Fix:**
```
home_team_locks: 0
away_team_locks: 0
```

**After Fix:**
```
home_team_locks: [actual count]
away_team_locks: [actual count]
```

## Impact

- ✅ **Automatic Updates**: The scheduled function will now properly count locks
- ✅ **Manual Updates**: All manual statistics updates will count locks correctly
- ✅ **Real-time**: New picks will trigger proper lock counting via database triggers
- ✅ **Backwards Compatible**: No changes to database schema required

## Testing

To test the fix:

```javascript
// Test the updated function
const { data, error } = await supabase.rpc('scheduled_game_statistics');
console.log('Games updated:', data[0].games_updated);

// Verify a specific game
const { data: game } = await supabase
  .from('games')
  .select('home_team_locks, away_team_locks')
  .eq('id', 'some-game-id')
  .single();

console.log('Lock counts:', game.home_team_locks, game.away_team_locks);
```

The fix ensures that lock statistics are preserved and calculated correctly in all automatic and scheduled updates.