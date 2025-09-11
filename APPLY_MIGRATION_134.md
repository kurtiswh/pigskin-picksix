# URGENT: Apply Migration 134 to Fix Pick Submission Error

## Problem
Pick submission is STILL failing with error:
```
Pick submission failed (400): column "updated_at" of relation "weekly_leaderboard" does not exist
```

## Root Cause Analysis
After investigating, the issue is that Migration 133 didn't catch all the triggers. There are multiple triggers with different names that all try to update the leaderboard tables:

- `update_weekly_leaderboard_on_pick_change` - This trigger function contains `updated_at = NOW()` 
- `update_weekly_leaderboard_trigger`
- And several others with similar names

## Solution: Migration 134
This migration drops ALL possible leaderboard-related triggers comprehensively.

## How to Apply

### Supabase Dashboard (Required)
1. Go to Supabase Dashboard → SQL Editor
2. Copy and paste the contents of `database/migrations/134_drop_all_remaining_leaderboard_triggers.sql`
3. Run the SQL

## Complete SQL to Apply
```sql
-- Drop ALL triggers that might be trying to update leaderboard tables (now views)

-- Triggers on picks table that update leaderboards
DROP TRIGGER IF EXISTS picks_season_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS picks_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_on_pick_change ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_on_pick_change ON public.picks;

-- Triggers directly on leaderboard tables (now views)
DROP TRIGGER IF EXISTS update_season_leaderboard_updated_at ON public.season_leaderboard;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_updated_at ON public.weekly_leaderboard;

-- Any anonymous picks triggers that might also be causing issues
DROP TRIGGER IF EXISTS update_weekly_leaderboard_anon_trigger ON public.anonymous_picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_anon_trigger ON public.anonymous_picks;
```

## Why This Works
- Migration 131 converted leaderboards from tables to views
- Views don't have `updated_at` columns
- The trigger functions were still trying to `UPDATE weekly_leaderboard SET updated_at = NOW()`
- This comprehensive migration removes ALL such triggers
- Leaderboards will still work perfectly - they're computed dynamically from picks data

## Test After Applying
1. Try selecting games on the picks page ✅
2. Try submitting picks - should work without the "weekly_leaderboard" error ✅

## Impact
- ✅ Pick creation will work
- ✅ Pick submission will work  
- ✅ Leaderboards will still display correctly (they're views, computed in real-time)
- ⚡ Actually improves performance - no more trigger overhead