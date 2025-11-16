# Enable Automatic Game Updates - Step-by-Step Guide

## Problem

Games are only updating when manually triggered, despite having all the infrastructure for automatic updates in place.

## Root Cause

Migration 138 provided setup instructions but **did not actually create the cron jobs**. The pg_cron jobs need to be manually configured with your Supabase project credentials.

---

## Solution Overview

This guide will help you:
1. Enable the pg_cron PostgreSQL extension
2. Create scheduled cron jobs that trigger Edge Functions
3. Verify the setup is working correctly

**Time Required:** 15-20 minutes

---

## Prerequisites

Before starting, ensure you have:

- ✅ Supabase project created
- ✅ Database migrations applied (especially migrations 138, 139, 140)
- ✅ Edge Functions deployed (`live-score-updater`, `update-game-stats`)
- ✅ Access to Supabase SQL Editor
- ✅ Project admin permissions

---

## Step 1: Gather Required Information

### 1.1 Get Your Project Reference ID

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Settings → General**
4. Copy the **Reference ID** (e.g., `zgdaqbnpgrabbxljmiqy`)

### 1.2 Get Your Service Role Key

1. In Supabase Dashboard, navigate to **Settings → API**
2. Find the **service_role** key section
3. Click **Reveal** to show the key
4. Copy the entire key (starts with `eyJ...`)

⚠️ **SECURITY WARNING:** The service_role key is extremely sensitive. Never commit it to version control or share it publicly!

---

## Step 2: Update Migration 141

### 2.1 Open the Migration File

Open `database/migrations/141_enable_auto_updates.sql` in your editor.

### 2.2 Replace Placeholder Values

Find and replace **all instances** of:
- `YOUR_PROJECT_ID` → Your actual project reference ID
- `YOUR_SERVICE_ROLE_KEY` → Your actual service role key

There are **6 places** to update:
1. Job 1: `live-scoring-thu-sat` - URL (line ~56)
2. Job 1: `live-scoring-thu-sat` - Authorization header (line ~59)
3. Job 2: `live-scoring-sunday` - URL (line ~84)
4. Job 2: `live-scoring-sunday` - Authorization header (line ~87)
5. Job 3: `update-game-statistics` - URL (line ~112)
6. Job 3: `update-game-statistics` - Authorization header (line ~115)

### 2.3 Example Before/After

**BEFORE:**
```sql
url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/live-score-updater',
'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
```

**AFTER:**
```sql
url := 'https://zgdaqbnpgrabbxljmiqy.supabase.co/functions/v1/live-score-updater',
'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
```

---

## Step 3: Run the Migration

### 3.1 Open Supabase SQL Editor

1. Go to Supabase Dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**

### 3.2 Execute the Migration

1. Copy the **entire contents** of `database/migrations/141_enable_auto_updates.sql`
2. Paste into the SQL Editor
3. Click **Run** or press `Ctrl+Enter`

### 3.3 Verify Success

You should see output like:
```
✅ pg_cron extension enabled
✅ Created job: live-scoring-thu-sat (Thu-Sat every 5 min)
✅ Created job: live-scoring-sunday (Sun morning every 5 min)
✅ Created job: update-game-statistics (Sat 11am CT weekly)
📊 Total cron jobs: 3
```

---

## Step 4: Verify Edge Functions Are Deployed

### 4.1 Check Deployment Status

In Supabase Dashboard:
1. Navigate to **Edge Functions**
2. Verify these functions exist:
   - `live-score-updater`
   - `update-game-stats`

### 4.2 Deploy If Missing

If functions aren't deployed, run:

```bash
# Deploy live score updater
npx supabase functions deploy live-score-updater

# Deploy game statistics updater
npx supabase functions deploy update-game-stats
```

### 4.3 Set Environment Variables

For **BOTH** Edge Functions, set these environment variables in Supabase Dashboard → Edge Functions → Settings:

#### For `live-score-updater`:
- `CFBD_API_KEY` → Your CollegeFootballData.com API key
- `SUPABASE_URL` → Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` → Your service role key

#### For `update-game-stats`:
- `SUPABASE_URL` → Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` → Your service role key

---

## Step 5: Verify the Setup

### 5.1 Run Verification Script

```bash
SUPABASE_SERVICE_ROLE_KEY="your_service_role_key" node verify-auto-updates.cjs
```

This script checks:
- ✅ pg_cron extension is enabled
- ✅ All 3 cron jobs are scheduled
- ✅ No placeholder values remain
- ✅ Edge Functions exist
- ✅ Database functions exist

### 5.2 Check Cron Jobs Manually

In Supabase SQL Editor, run:

```sql
-- View all scheduled jobs
SELECT * FROM cron.job;

-- Expected output: 3 jobs
-- live-scoring-thu-sat | */5 0-5 * * 5-7
-- live-scoring-sunday  | */5 6-13 * * 0
-- update-game-statistics | 0 16 * * 6
```

### 5.3 Check Job Execution History

```sql
-- View recent job runs
SELECT
  jobname,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

**Note:** If no jobs have run yet, this is normal! Jobs only run during their scheduled times.

---

## Step 6: Test Manually (Optional)

### 6.1 Test Live Score Updater

```bash
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/live-score-updater \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "message": "Live update complete: X games updated",
  "gamesChecked": 6,
  "gamesUpdated": 3,
  "newlyCompleted": 1
}
```

### 6.2 Test Game Statistics Updater

```bash
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/update-game-stats \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "message": "Game statistics updated: 6 games",
  "gamesUpdated": 6,
  "statisticsCalculated": 12
}
```

---

## What Happens Now

### Automatic Updates During Game Hours

**Thursday 6pm - Saturday 11:59pm CT:**
- Every 5 minutes, the system:
  1. ✅ Fetches live scores from CollegeFootballData.com API
  2. ✅ Updates game scores, status, quarter, and clock
  3. ✅ Calculates winners when games complete
  4. ✅ Processes picks and awards points
  5. ✅ Updates leaderboards

**Sunday 12am - 8am CT:**
- Same process continues for Sunday games
- Runs every 5 minutes

**Saturday 11:00 AM CT (Weekly):**
- Calculates pick statistics for all games
- Updates pick counts and percentages
- Shows "X% picked this team" on game cards

---

## Monitoring & Troubleshooting

### Check Edge Function Logs

1. Go to Supabase Dashboard → Edge Functions
2. Select a function (e.g., `live-score-updater`)
3. Click **Logs** tab
4. Look for successful executions:
   - `🏈 Live score updater cron job started`
   - `✅ Game updated successfully`
   - `📊 Live Update Results: X games updated`

### Check for Errors

Common issues and solutions:

#### ❌ Error: "CFBD_API_KEY environment variable not set"
**Solution:** Set CFBD_API_KEY in Edge Functions settings

#### ❌ Error: "No active week found"
**Solution:** Open picks for the current week in Admin Dashboard

#### ❌ Error: "CFBD API error: 401"
**Solution:** Check CFBD API key is valid at collegefootballdata.com

#### ❌ Error: Cron jobs not running
**Solution:** Verify:
1. Jobs are active: `SELECT * FROM cron.job WHERE active = true;`
2. No placeholder values remain in job definitions
3. Edge Functions are deployed

### Disable Auto-Updates (If Needed)

To temporarily stop automatic updates:

```sql
-- Unschedule all jobs
SELECT cron.unschedule('live-scoring-thu-sat');
SELECT cron.unschedule('live-scoring-sunday');
SELECT cron.unschedule('update-game-statistics');
```

To re-enable, re-run migration 141.

---

## Schedule Reference

| Job Name | When | Frequency | Purpose |
|----------|------|-----------|---------|
| live-scoring-thu-sat | Thu 6pm - Sat 11:59pm CT | Every 5 min | Live game updates |
| live-scoring-sunday | Sun 12am - 8am CT | Every 5 min | Sunday game updates |
| update-game-statistics | Sat 11:00 AM CT | Once weekly | Pick statistics |

**Cron Expressions:**
- `*/5 0-5 * * 5-7` = Every 5 min, Fri-Sun 00:00-05:59 UTC (Thu 6pm - Sat 11:59pm CT)
- `*/5 6-13 * * 0` = Every 5 min, Sun 06:00-13:59 UTC (Sun 12am - 8am CT)
- `0 16 * * 6` = Every Sat 16:00 UTC (11:00 AM CT)

---

## Success Checklist

Before considering the setup complete, verify:

- [ ] Migration 141 ran successfully with no errors
- [ ] All 3 cron jobs are listed in `cron.job` table
- [ ] No placeholder values (`YOUR_PROJECT_ID`, `YOUR_SERVICE_ROLE_KEY`) remain
- [ ] Both Edge Functions are deployed
- [ ] Environment variables are set for both Edge Functions
- [ ] Manual test of Edge Functions returns success
- [ ] Verification script shows all green checkmarks
- [ ] Edge Function logs show successful execution (if within scheduled hours)

---

## Next Steps

1. **Monitor the first few executions** during game hours
2. **Check Edge Function logs** for any errors
3. **Verify picks are being scored** automatically when games complete
4. **Check leaderboards update** in real-time during games

If everything is working correctly, you should never need to manually update games again!

---

## Need Help?

If you encounter issues:
1. Run the verification script: `node verify-auto-updates.cjs`
2. Check Edge Function logs in Supabase Dashboard
3. Query `cron.job_run_details` for execution history
4. Verify CFBD API key is valid and not rate-limited

For persistent issues, check the Supabase logs and ensure all migrations (138-141) have been applied.

---

## Files Reference

- **Migration:** `database/migrations/141_enable_auto_updates.sql`
- **Verification Script:** `verify-auto-updates.cjs`
- **Edge Functions:**
  - `supabase/functions/live-score-updater/index.ts`
  - `supabase/functions/update-game-stats/index.ts`
- **Original Instructions:** `AUTOMATED_LIVE_SCORING_SETUP.md`

---

**Last Updated:** November 2024
**Migration Version:** 141
