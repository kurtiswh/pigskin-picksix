# Automated Live Scoring & Game Statistics Setup Guide

## Overview

This guide explains how to set up **fully automated** live scoring and game statistics updates using Supabase Edge Functions and pg_cron.

### What Gets Automated

1. **Live Score Updates**: Automatically fetches game scores from CFBD API during game hours (Thursday 6pm - Sunday 8am Central Time)
2. **Game Statistics**: Automatically updates pick counts and percentages when picks close (typically Saturday 11am CT)

### Architecture

```
pg_cron (Supabase) → Edge Functions → CFBD API / Database Functions → Updates
```

- **pg_cron**: PostgreSQL extension that triggers scheduled jobs
- **Edge Functions**: Serverless Deno functions hosted on Supabase
- **CFBD API**: CollegeFootballData.com API for live scores
- **Database Functions**: SQL functions for game statistics

---

## Part 1: Deploy Edge Functions

### Step 1.1: Deploy Live Score Updater

```bash
npx supabase functions deploy live-score-updater
```

**What it does**: Fetches live scores from CFBD API, updates game data, calculates winners, and processes picks

### Step 1.2: Deploy Game Stats Updater

```bash
npx supabase functions deploy update-game-stats
```

**What it does**: Calls `scheduled_game_statistics()` database function to update pick counts and percentages

---

## Part 2: Configure Environment Variables

Go to **Supabase Dashboard → Edge Functions → Settings** and add these environment variables for **BOTH** functions:

### For `live-score-updater`:

| Variable | Value | Where to Find |
|----------|-------|---------------|
| `CFBD_API_KEY` | Your CFBD API key | https://collegefootballdata.com (after sign up) |
| `SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role secret | Supabase Dashboard → Settings → API → service_role key (NOT anon!) |

### For `update-game-stats`:

| Variable | Value | Where to Find |
|----------|-------|---------------|
| `SUPABASE_URL` | Your Supabase project URL | Supabase Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role secret | Supabase Dashboard → Settings → API → service_role key |

---

## Part 3: Set Up Automated Cron Jobs

### Prerequisites

1. Find your **Project ID** (Reference ID):
   - Go to Supabase Dashboard → Settings → General
   - Copy the "Reference ID" (e.g., `zgdaqbnpgrabbxljmiqy`)

2. Get your **Service Role Key**:
   - Go to Supabase Dashboard → Settings → API
   - Copy the `service_role` key (keep this secret!)

### Step 3.1: Enable pg_cron Extension

In **Supabase SQL Editor**, run:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### Step 3.2: Schedule Live Score Updates

**Schedule 1: Thursday 6pm - Saturday 11:59pm CT** (every 5 minutes)

Replace `YOUR_PROJECT_ID` and `YOUR_SERVICE_ROLE_KEY`:

```sql
SELECT cron.schedule(
  'live-scoring-thu-sat',
  '*/5 0-5 * * 5-7',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/live-score-updater',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

**Schedule 2: Sunday 12am - 8am CT** (every 5 minutes)

```sql
SELECT cron.schedule(
  'live-scoring-sunday',
  '*/5 6-13 * * 0',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/live-score-updater',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

### Step 3.3: Schedule Game Statistics Updates

**Every Saturday at 11:00 AM CT** (16:00 UTC):

```sql
SELECT cron.schedule(
  'update-game-statistics',
  '0 16 * * 6',
  $$
  SELECT
    net.http_post(
      url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/update-game-stats',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

---

## Part 4: Verify Setup

### Check Scheduled Jobs

```sql
-- View all scheduled cron jobs
SELECT * FROM cron.job;
```

Expected output:
- `live-scoring-thu-sat` - Every 5 min Thu-Sat
- `live-scoring-sunday` - Every 5 min Sun morning
- `update-game-statistics` - Every Sat 11am CT

### Check Job Execution History

```sql
-- View recent cron job runs
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

Look for:
- ✅ `succeeded` status
- Return message showing games updated
- No error messages

### Monitor Edge Function Logs

1. Go to **Supabase Dashboard → Edge Functions**
2. Select `live-score-updater` or `update-game-stats`
3. Click **Logs** tab
4. Look for successful execution logs:
   - `🏈 Live score updater cron job started`
   - `✅ Game updated successfully`
   - `📊 Live Update Results: X games updated`

---

## Part 5: Manual Testing

### Test Live Score Updater

```bash
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/live-score-updater \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "message": "Live update complete: X games updated, Y newly completed",
  "gamesChecked": 6,
  "gamesUpdated": 3,
  "newlyCompleted": 1,
  "errors": [],
  "timestamp": "2024-09-30T12:00:00.000Z"
}
```

### Test Game Statistics Updater

```bash
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/update-game-stats \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "message": "Game statistics updated: 6 games, 12 statistics calculated",
  "gamesUpdated": 6,
  "statisticsCalculated": 12,
  "errors": [],
  "timestamp": "2024-09-30T16:00:00.000Z"
}
```

---

## Troubleshooting

### Issue: Cron jobs not running

**Solution**: Verify pg_cron is enabled and check job schedule:

```sql
-- Check if pg_cron is enabled
SELECT * FROM pg_extension WHERE extname = 'pg_cron';

-- If not enabled, run:
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### Issue: Edge Functions failing with 401/403

**Solution**: Check environment variables are set correctly:
1. Go to Edge Functions → Settings
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is the **service role** key (not anon key)
3. Verify `CFBD_API_KEY` is valid

### Issue: No games being updated

**Solution**: Check if there's an active week:

```sql
-- Verify active week exists
SELECT * FROM week_settings WHERE picks_open = true;
```

If no active week, open picks for the current week in Admin Dashboard.

### Issue: CFBD API rate limits

**Solution**: CFBD free tier allows 200 calls/hour. Current setup uses:
- ~12 calls/hour during game hours (every 5 min)
- Well within limits

If you upgrade to paid CFBD tier, you can increase frequency to every 2-3 minutes.

---

## Unscheduling Jobs (If Needed)

To remove scheduled jobs:

```sql
-- Unschedule live scoring jobs
SELECT cron.unschedule('live-scoring-thu-sat');
SELECT cron.unschedule('live-scoring-sunday');

-- Unschedule game statistics
SELECT cron.unschedule('update-game-statistics');
```

---

## Schedule Details Reference

### Live Scoring Schedule

| Day | Time (CT) | Time (UTC) | Frequency | Cron Expression |
|-----|-----------|------------|-----------|-----------------|
| Thu | 6pm - 11:59pm | Fri 00:00 - 05:59 | Every 5 min | `*/5 0-5 * * 5-7` |
| Fri | All day | Sat 00:00 - 23:59 | Every 5 min | (same as above) |
| Sat | All day | Sun 00:00 - 05:59 | Every 5 min | (same as above) |
| Sun | 12am - 8am | 06:00 - 13:59 | Every 5 min | `*/5 6-13 * * 0` |

### Game Statistics Schedule

| Day | Time (CT) | Time (UTC) | Frequency | Cron Expression |
|-----|-----------|------------|-----------|-----------------|
| Sat | 11:00 AM | 16:00 | Once weekly | `0 16 * * 6` |

---

## Benefits of This Setup

✅ **Fully Automated** - No manual intervention needed
✅ **Reliable** - Server-side execution, doesn't require browser to be open
✅ **Cost Effective** - Uses Supabase's native cron infrastructure (free tier)
✅ **Smart Scheduling** - Only runs during game hours to conserve API calls
✅ **Fallback Ready** - Manual triggers still available in Admin Dashboard
✅ **Scalable** - Easy to adjust frequency or add new schedules

---

## What Happens Automatically Now

### During Game Hours (Thu 6pm - Sun 8am CT):

**Every 5 minutes:**
1. ✅ CFBD API fetched for live scores
2. ✅ Game scores, status, and quarter/clock updated
3. ✅ Winner against spread calculated when games complete
4. ✅ Picks processed and points awarded
5. ✅ Leaderboards reflect latest results

### At Pick Closure (Sat 11am CT):

**Once per week:**
1. ✅ Pick counts calculated for each game
2. ✅ Lock pick counts separated from regular picks
3. ✅ Pick percentages updated
4. ✅ Statistics visible on game cards

---

## Support

If you encounter issues:
1. Check Supabase Edge Function logs
2. Check `cron.job_run_details` table for execution history
3. Test functions manually with curl commands
4. Verify environment variables are correct
5. Ensure CFBD API key is valid and not rate-limited

For questions, contact admin@pigskinpicksix.com
