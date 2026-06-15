# 🚨 Fix for Remaining Timeout Issues (Virginia Tech & Notre Dame Games)

## Problem
Two games are still timing out even with optimizations:
- Virginia Tech @ South Carolina 
- Notre Dame @ Miami

These games likely have a very large number of picks to process.

## Solution: Apply Migration 112

### Step 1: Apply Migration 112
1. Go to **Supabase Dashboard** → **SQL Editor** → **New Query**
2. Copy the entire contents of `database/migrations/112_fix_remaining_timeouts.sql`
3. Execute the migration
4. Verify you see: `✅ Migration 112 COMPLETED`

### Step 2: Process the Problem Games Manually
1. Still in **SQL Editor**, create a **New Query**
2. Copy the entire contents of `process_problem_games.sql`
3. Execute the query
4. This will process just those two games with ultra-small chunks (25 picks at a time)

### Step 3: Verify Success
After running the script, you should see output like:
```
📋 Processing Virginia Tech @ South Carolina...
✅ Success! Updated 70 picks and 60 anonymous picks

📋 Processing Notre Dame @ Miami...
✅ Success! Updated 70 picks and 60 anonymous picks

🏁 Processing complete!
```

### Step 4: Try the Admin Dashboard Again
Go back to **Admin Dashboard** → **Score Manager** and the picks scoring should now show all games processed successfully.

## What Migration 112 Does

### Ultra-Optimized Chunking
- Processes picks in chunks of 50 (configurable down to 25 for problem games)
- Adds micro-pauses (0.01 seconds) between chunks
- Separate processing for regular and anonymous picks
- Tracks partial progress even if timeout occurs

### Why These Games Were Timing Out
These games likely have:
- The most user picks (popular matchups)
- The most anonymous picks
- Processing 100+ picks in a single transaction was hitting the timeout

### The Fix
Instead of processing all picks at once:
1. Process 25-50 picks
2. Commit that chunk
3. Pause 0.01 seconds
4. Process next chunk
5. Repeat until done

This keeps each transaction small enough to complete within the timeout limit.

## If Still Having Issues

Try even smaller chunks:
```sql
-- Process with ultra-small chunks of 10
SELECT * FROM calculate_pick_results_for_game_chunked(
    (SELECT id FROM games WHERE home_team = 'South Carolina' AND away_team = 'Virginia Tech' AND season = 2025 AND week = 1),
    10  -- Process only 10 picks at a time
);
```

Or increase your database statement timeout temporarily:
```sql
-- Increase timeout to 60 seconds (only for this session)
SET statement_timeout = '60s';

-- Then run the processing
SELECT * FROM calculate_pick_results_for_game_chunked(...);

-- Reset timeout
RESET statement_timeout;
```