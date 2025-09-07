# Apply Migrations 117 & 118: Fix Premature Winner Calculation

## Issue
Games that aren't completed are getting `winner_against_spread` and `margin_bonus` values set incorrectly.

## Root Cause
The database function was calculating winners for games that "should be completed" based on time, rather than only for games that are actually marked as completed.

## Fix
1. **Migration 117**: Update the `scheduled_live_game_updates()` function to only calculate winners when `status = 'completed'`
2. **Migration 118**: Clean up existing incorrect data by clearing winner fields for non-completed games

## Steps to Apply

### 1. Go to Supabase SQL Editor

### 2. Run Migration 117 (Fix Function Logic)
Copy and run the contents of: `database/migrations/117_fix_premature_winner_calculation.sql`

### 3. Run Migration 118 (Clean Up Data)  
Copy and run the contents of: `database/migrations/118_cleanup_incorrect_winners.sql`

## Expected Results
- ✅ Only completed games will have `winner_against_spread` and `margin_bonus` set
- ✅ In-progress and scheduled games will have these fields as NULL
- ✅ Future games will not get premature winner calculations

## Verification
After running the migrations, check the games table:
```sql
SELECT status, winner_against_spread, margin_bonus 
FROM games 
WHERE season = 2025 AND week = 2
ORDER BY status, home_team;
```

Should show:
- `completed` games: Can have winner data
- `in_progress` and `scheduled` games: Should have NULL for winner fields