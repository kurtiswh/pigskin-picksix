# Auto-Update Fix Summary

## Problem Identified

Games are only updating when manually triggered, despite having the Supabase trigger infrastructure in place.

## Root Cause

**Migration 138** (`database/migrations/138_setup_automated_cron_jobs.sql`) provided setup instructions but **did NOT automatically create the pg_cron jobs**. The SQL statements for creating cron jobs were commented out and contained placeholder values that need to be replaced with actual Supabase project credentials.

## Solution Implemented

Created a complete solution with three components:

### 1. Migration 141 - Enable Auto-Updates ✅
**File:** `database/migrations/141_enable_auto_updates.sql`

**What it does:**
- Enables pg_cron PostgreSQL extension
- Creates 3 scheduled cron jobs:
  - `live-scoring-thu-sat` - Every 5 min Thu 6pm - Sat 11:59pm CT
  - `live-scoring-sunday` - Every 5 min Sun 12am - 8am CT
  - `update-game-statistics` - Every Sat 11:00 AM CT weekly
- Includes comprehensive verification and logging
- Provides clear error messages if placeholders aren't replaced

**Before running:** Must replace `YOUR_PROJECT_ID` and `YOUR_SERVICE_ROLE_KEY` with actual values (6 places total)

### 2. Verification Script ✅
**File:** `verify-auto-updates.cjs`

**What it checks:**
1. pg_cron extension is enabled
2. All 3 cron jobs are scheduled and active
3. No placeholder values remain in job definitions
4. Edge Functions source files exist
5. Database functions exist
6. Recent job execution history

**Usage:**
```bash
SUPABASE_SERVICE_ROLE_KEY="your_key" node verify-auto-updates.cjs
```

### 3. Step-by-Step Guide ✅
**File:** `ENABLE_AUTO_UPDATES_GUIDE.md`

**Contents:**
- Prerequisites checklist
- How to find Project ID and Service Role Key
- Detailed instructions for updating migration 141
- How to run the migration in Supabase SQL Editor
- Edge Function deployment steps
- Environment variable configuration
- Troubleshooting guide
- Monitoring instructions

---

## How the Auto-Update System Works

### Architecture Flow:
```
pg_cron (Supabase)
  → Triggers Edge Functions via HTTP POST
    → Edge Functions call CFBD API for live data
      → Edge Functions call database RPC functions
        → Database updates games and processes picks
          → Leaderboards reflect latest results
```

### Components Involved:

1. **pg_cron** - PostgreSQL extension that runs scheduled jobs
2. **Edge Functions:**
   - `live-score-updater` - Fetches CFBD API, updates games, calculates winners
   - `update-game-stats` - Calculates pick statistics and percentages
3. **Database Functions:**
   - `calculate_and_update_completed_game()` - Single source of truth for scoring (migration 139)
   - `scheduled_game_statistics()` - Updates pick counts and percentages
   - `process_picks_for_completed_game()` - Awards points to picks

### Automatic Schedule:

**During Game Hours (Thu 6pm - Sun 8am CT):**
- Every 5 minutes:
  - ✅ Fetch live scores from CFBD
  - ✅ Update game scores, status, quarter, clock
  - ✅ Calculate winners when games complete
  - ✅ Process picks and award points
  - ✅ Update leaderboards

**Weekly Stats Update (Sat 11am CT):**
- Once per week:
  - ✅ Calculate pick statistics for all games
  - ✅ Update pick counts and percentages
  - ✅ Show "X% picked this team" on game cards

---

## Files Created

1. **database/migrations/141_enable_auto_updates.sql** - Migration to create cron jobs
2. **verify-auto-updates.cjs** - Script to verify setup
3. **ENABLE_AUTO_UPDATES_GUIDE.md** - Comprehensive setup guide
4. **AUTO_UPDATE_FIX_SUMMARY.md** - This file

---

## What You Need to Do

### Step 1: Get Supabase Credentials
1. Go to Supabase Dashboard → Settings → General
2. Copy **Reference ID** (e.g., `zgdaqbnpgrabbxljmiqy`)
3. Go to Settings → API
4. Copy **service_role key** (starts with `eyJ...`)

### Step 2: Update Migration 141
1. Open `database/migrations/141_enable_auto_updates.sql`
2. Find and replace ALL instances of:
   - `YOUR_PROJECT_ID` → Your reference ID (6 places)
   - `YOUR_SERVICE_ROLE_KEY` → Your service role key (6 places)
3. Save the file

### Step 3: Run the Migration
1. Open Supabase SQL Editor
2. Copy entire contents of migration 141
3. Paste and execute
4. Verify you see "✅ Created job" messages

### Step 4: Verify Edge Functions
1. Check they're deployed: Supabase Dashboard → Edge Functions
2. If missing, deploy them:
   ```bash
   npx supabase functions deploy live-score-updater
   npx supabase functions deploy update-game-stats
   ```

### Step 5: Set Environment Variables
In Supabase Dashboard → Edge Functions → Settings, set for BOTH functions:
- `SUPABASE_URL` - Your project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Your service role key

For `live-score-updater` also set:
- `CFBD_API_KEY` - Your CollegeFootballData.com API key

### Step 6: Verify Setup
```bash
SUPABASE_SERVICE_ROLE_KEY="your_key" node verify-auto-updates.cjs
```

Should show all green checkmarks!

---

## Testing & Monitoring

### Check Cron Jobs
```sql
-- View scheduled jobs
SELECT * FROM cron.job;

-- View recent executions
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

### Check Edge Function Logs
1. Supabase Dashboard → Edge Functions
2. Select function (e.g., `live-score-updater`)
3. Click **Logs** tab
4. Look for successful executions

### Manual Test
```bash
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/live-score-updater \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Expected: `{"success": true, "message": "Live update complete..."}`

---

## Troubleshooting

### Issue: Cron jobs created but not running
**Check:** Job execution history in `cron.job_run_details`
**Solution:** Jobs only run during scheduled times. Wait for game hours or adjust schedule for testing.

### Issue: Jobs running but Edge Functions failing
**Check:** Edge Function logs for errors
**Common causes:**
- Missing environment variables
- Invalid CFBD API key
- No active week in database

### Issue: Edge Functions succeed but games don't update
**Check:** Database function logs and game status
**Solution:** Ensure games have `picks_open = true` in week_settings

---

## Success Criteria

Setup is complete when:
- ✅ Migration 141 runs without errors
- ✅ 3 cron jobs appear in `cron.job` table
- ✅ No placeholder values remain
- ✅ Edge Functions are deployed
- ✅ Environment variables are set
- ✅ Verification script shows all green checks
- ✅ Manual test returns success
- ✅ Games update automatically during game hours

---

## Why This Fix Works

### Before:
- Manual intervention required to update games
- Migration 138 only provided commented instructions
- No cron jobs actually created
- Edge Functions existed but weren't triggered

### After:
- Fully automated game updates every 5 minutes during game hours
- No manual intervention needed
- Server-side execution (doesn't require browser)
- Uses Supabase's native pg_cron (free tier)
- Reliable and scalable

---

## Additional Notes

### API Usage
- CFBD free tier: 200 calls/hour
- Current setup: ~12 calls/hour (every 5 min)
- Well within limits! ✅

### Cost
- pg_cron: Included in Supabase free tier
- Edge Functions: 500K invocations/month free
- Estimated usage: ~5,000 invocations/month
- **Total cost: $0** ✅

### Maintenance
Once set up, requires **zero maintenance**. System runs automatically throughout the season.

---

## Questions?

For issues or questions:
1. Read the comprehensive guide: `ENABLE_AUTO_UPDATES_GUIDE.md`
2. Run the verification script: `verify-auto-updates.cjs`
3. Check Edge Function logs in Supabase Dashboard
4. Query `cron.job_run_details` for execution history

---

**Created:** November 2024
**Migration:** 141
**Status:** Ready to deploy
