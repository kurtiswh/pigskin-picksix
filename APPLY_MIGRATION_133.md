# URGENT: Apply Migration 133 to Fix Pick Creation Error

## Problem
Pick creation AND submission are failing with errors:
```
column "updated_at" of relation "season_leaderboard" does not exist
column "updated_at" of relation "weekly_leaderboard" does not exist
```

## Root Cause
- Migration 028 created triggers on `season_leaderboard` and `weekly_leaderboard` tables
- Migration 131 converted them back to views but didn't drop the triggers
- The orphaned triggers are still firing when picks are created, causing errors

## Fix Required
Apply Migration 133 to drop the orphaned triggers.

## How to Apply

### Option 1: Supabase Dashboard (Recommended)
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `database/migrations/133_drop_orphaned_leaderboard_triggers.sql`
3. Run the SQL

### Option 2: psql (if you have database access)
```bash
psql [your-connection-string] < database/migrations/133_drop_orphaned_leaderboard_triggers.sql
```

### Option 3: Local Supabase CLI (if configured)
```bash
npx supabase db reset  # WARNING: This resets all data
# OR
npx supabase migration new drop_orphaned_triggers
# Copy the SQL content and apply
```

## Verification
After applying the migration, pick creation should work without the leaderboard error.

## SQL to Apply
```sql
-- Drop orphaned triggers from Migration 028
DROP TRIGGER IF EXISTS update_season_leaderboard_updated_at ON public.season_leaderboard;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_updated_at ON public.weekly_leaderboard;

-- Drop picks triggers that try to update leaderboard tables (now views)
DROP TRIGGER IF EXISTS picks_season_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS picks_weekly_leaderboard_trigger ON public.picks;
```

## Test
After applying:
1. Try selecting a game on the picks page - should work without errors
2. Try submitting picks - should work without the "weekly_leaderboard" error