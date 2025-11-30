# Migration 147: Season Winners Table

## How to Apply This Migration

Since direct database connections are restricted, apply this migration through the Supabase Dashboard:

1. Go to your Supabase project dashboard
2. Click on "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy the entire contents of `147_create_season_winners.sql`
5. Paste into the SQL editor
6. Click "Run" (or press Cmd/Ctrl + Enter)

## What This Migration Does

- Creates `season_winners` table to track all winner categories and payouts
- Stores point winners (1st-10th place)
- Stores lock winners (1st-2nd place)
- Stores bracket winners (admin managed, 1st-2nd place)
- Stores best finish winner
- Tracks weekly winners and prize pool details
- Includes helper function `get_or_create_season_winners(p_season)`

## Verification

After running the migration, verify it worked:

```sql
-- Check that the table exists
SELECT COUNT(*) FROM information_schema.tables
WHERE table_name = 'season_winners';
-- Should return 1

-- Check the helper function exists
SELECT proname FROM pg_proc WHERE proname = 'get_or_create_season_winners';
-- Should return 1 row
```

## Features Added

- **Winners Tab**: New tab on leaderboard page showing all winners and payout percentages
- **Admin Control**: Bracket winners can be set in Admin Dashboard → Score Updates
- **Automatic Calculation**: Point/Lock/Best Finish winners can be calculated from leaderboard data
- **Payout Display**: Shows percentage and dollar amounts based on total pot
