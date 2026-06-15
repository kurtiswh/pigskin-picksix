# 🚨 URGENT: Apply Migration 135 - Drop Trigger Functions

## Critical Finding
Your console log reveals the **exact same error** is happening:
```
PATCH /rest/v1/picks?user_id=eq.ba84da74-626d-4f6d-ac21-4211fe4c1eec&week=eq.3&season=eq.2025
Error: column "updated_at" of relation "weekly_leaderboard" does not exist
```

## The Issue
My testing revealed:
- ✅ **API key auth works** (my tests)
- ❌ **JWT auth fails** (your submission uses JWT)

This means there's a trigger function that fires specifically when using JWT authentication (like user submissions) that still contains:
```sql
UPDATE weekly_leaderboard SET updated_at = NOW()
```

## Solution: Drop the Functions (Not Just Triggers)
Migration 135 takes a more aggressive approach - it drops the **actual functions** that contain the problematic UPDATE statements.

## Apply This Migration NOW

### Supabase Dashboard → SQL Editor
```sql
-- First drop any remaining triggers (in case Migration 134 wasn't applied)
DROP TRIGGER IF EXISTS picks_season_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS picks_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_trigger ON public.picks;
DROP TRIGGER IF EXISTS update_weekly_leaderboard_on_pick_change ON public.picks;
DROP TRIGGER IF EXISTS update_season_leaderboard_on_pick_change ON public.picks;

-- Now drop the actual FUNCTIONS that contain the UPDATE statements
DROP FUNCTION IF EXISTS public.update_weekly_leaderboard_on_pick_change() CASCADE;
DROP FUNCTION IF EXISTS public.update_season_leaderboard_on_pick_change() CASCADE;
DROP FUNCTION IF EXISTS public.update_weekly_leaderboard_with_source(UUID, INTEGER, INTEGER, VARCHAR) CASCADE;
DROP FUNCTION IF EXISTS public.update_season_leaderboard_with_source(UUID, INTEGER, INTEGER, VARCHAR) CASCADE;

-- Drop any other leaderboard update functions
DROP FUNCTION IF EXISTS public.refresh_weekly_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.refresh_season_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.rebuild_weekly_leaderboard() CASCADE;
DROP FUNCTION IF EXISTS public.rebuild_season_leaderboard() CASCADE;
```

## Why This Will Work
- **CASCADE** drops any triggers that reference these functions
- **IF EXISTS** prevents errors if already dropped
- Removes the actual code containing `UPDATE weekly_leaderboard SET updated_at = NOW()`

## Test After Applying
Try submitting picks - the JWT authentication should now work without the "weekly_leaderboard" error.

## Impact
- ✅ Pick submission will work
- ✅ Leaderboards still display (they're views, computed in real-time)
- ✅ No performance impact (actually better - no trigger overhead)