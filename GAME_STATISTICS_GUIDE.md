# Game Statistics Management Guide

## Overview

The game statistics system tracks pick counts and lock counts for each game, providing real-time insights into user preferences. The system properly separates regular picks from lock picks and includes both authenticated users and anonymous picks.

## Database Columns

Each game in the `games` table has these statistics columns:

- `home_team_picks` - Number of regular (non-lock) picks for the home team
- `home_team_locks` - Number of lock picks for the home team
- `away_team_picks` - Number of regular (non-lock) picks for the away team
- `away_team_locks` - Number of lock picks for the away team
- `total_picks` - Total number of all picks for this game
- `pick_stats_updated_at` - Timestamp of last statistics update

## Automatic Updates

### 1. Scheduled Function
- **Function**: `scheduled_game_statistics()`
- **Schedule**: Every 30 minutes during game days (Sat 9:00am - Sun 8:00am Central)
- **Purpose**: Updates statistics for all games in the current active week
- **How it works**: Uses `calculate_game_pick_statistics_safe()` for each game

### 2. Database Triggers
Statistics are automatically updated when:
- Picks are inserted, updated, or deleted (`picks` table)
- Anonymous picks are inserted, updated, or deleted (`anonymous_picks` table)
- Pick visibility is changed (`show_on_leaderboard` field)
- Game status changes to "completed"

## Manual Updates

### Option 1: Single Game Update
```sql
-- Update statistics for a specific game
SELECT calculate_game_pick_statistics_safe('game-uuid-here');
```

### Option 2: Scheduled Function (Current Week)
```sql
-- Update all games in the currently active week
SELECT * FROM scheduled_game_statistics();
```

### Option 3: Via Supabase RPC (JavaScript)
```javascript
// Update a specific game
const { data, error } = await supabase.rpc('calculate_game_pick_statistics_safe', {
  game_id_param: 'game-uuid-here'
});

// Update all games in active week
const { data, error } = await supabase.rpc('scheduled_game_statistics');
```

### Option 4: Admin Dashboard
Use the "Scheduled Functions Manager" in the admin dashboard to manually run `scheduled_game_statistics`.

## How Statistics Are Calculated

The `calculate_game_pick_statistics_safe()` function:

1. **Counts Regular Picks**:
   - From `picks` table where `submitted = true` and `is_lock = false`
   - From `anonymous_picks` table where `show_on_leaderboard = true` and `is_lock = false`

2. **Counts Lock Picks**:
   - From `picks` table where `submitted = true` and `is_lock = true`
   - From `anonymous_picks` table where `show_on_leaderboard = true` and `is_lock = true`

3. **Separates by Team**: Counts picks for home team vs away team based on `selected_team`

4. **Updates Game Record**: Sets all statistics columns and `pick_stats_updated_at` timestamp

## Troubleshooting

### Statistics Don't Match Expected Counts

1. **Check Pick Submission Status**:
   ```sql
   -- For regular picks, ensure picks are from submitted pick sets
   SELECT user_id, COUNT(*) FROM picks
   WHERE game_id = 'game-uuid' AND submitted = true
   GROUP BY user_id;
   ```

2. **Check Anonymous Pick Visibility**:
   ```sql
   -- Anonymous picks must have show_on_leaderboard = true
   SELECT show_on_leaderboard, COUNT(*) FROM anonymous_picks
   WHERE game_id = 'game-uuid'
   GROUP BY show_on_leaderboard;
   ```

3. **Manual Recalculation**:
   ```sql
   -- Force recalculation for a specific game
   SELECT calculate_game_pick_statistics_safe('game-uuid');
   ```

### Zero Lock Counts When Locks Exist

This was the original issue - the `scheduled_game_statistics()` function was not using the comprehensive lock-aware calculation. **This has been fixed** in Migration 138.

### Performance Issues

- Statistics updates are designed to be fast and run automatically
- Triggers prevent infinite recursion using `pg_trigger_depth()`
- Batch updates process games individually to avoid long transactions

## Recent Fixes (Migration 138)

**Issue**: `scheduled_game_statistics()` was overriding proper lock statistics
**Fix**: Updated the function to use `calculate_game_pick_statistics_safe()` instead of its own calculation logic
**Result**: Lock counts are now properly maintained in all automatic updates

## Monitoring

Check if statistics are up to date:
```sql
-- Find games with outdated statistics
SELECT id, home_team, away_team, pick_stats_updated_at
FROM games
WHERE season = 2024
AND (pick_stats_updated_at IS NULL OR pick_stats_updated_at < NOW() - INTERVAL '1 hour')
ORDER BY week DESC;
```