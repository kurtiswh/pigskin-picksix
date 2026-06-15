# 💥 FIXED: Migration 137 - Nuclear Option

## Issue Fixed
The previous migration failed because I used the wrong system table name (`pg_triggers` doesn't exist). 

## Migration 137 - CORRECTED
Uses the correct PostgreSQL system tables:
- ✅ `information_schema.triggers` (instead of `pg_triggers`)
- ✅ `information_schema.routines` (for functions)

## Apply Migration 137

### Supabase Dashboard → SQL Editor
Copy and paste the entire contents of `database/migrations/137_nuclear_remove_leaderboard_references_fixed.sql`

## What It Does
1. **Finds all triggers** containing "leaderboard" using correct system tables
2. **Finds all functions** containing "leaderboard" using correct system tables  
3. **Manually drops** specific triggers/functions we know about
4. **Uses CASCADE** to eliminate dependencies
5. **Preserves leaderboard views** for display

## Expected Output
You should see messages like:
```
🗑️ Dropped trigger: picks_weekly_leaderboard_trigger on picks
🗑️ Dropped function: update_weekly_leaderboard_on_pick_change
✅ weekly_leaderboard view exists and will continue to work
💥 Migration 137 completed - NUCLEAR OPTION APPLIED
```

## Test After Applying
Try submitting picks - should work without the "weekly_leaderboard" error!

This corrected migration will eliminate ALL leaderboard interference while keeping the views functional.