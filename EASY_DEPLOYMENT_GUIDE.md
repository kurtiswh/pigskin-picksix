# Easy Deployment Guide - No CLI Required!

## The Simplest Way: Use Supabase Dashboard

Since CLI is having permission issues, let's deploy directly through the web interface. It's actually easier!

### Step 1: Deploy via Supabase Dashboard

**Go to your Supabase Edge Functions page:**
https://supabase.com/dashboard/project/zgdaqbnpgrabbxljmiqy/functions

---

## Function 1: live-score-updater

1. Click **"New Edge Function"** or **"Deploy new function"**
2. Function name: `live-score-updater`
3. Copy and paste this entire file: `supabase/functions/live-score-updater/index.ts`
4. Click **"Deploy"**

**Set Environment Secrets:**
After deployment, click the function → "Settings" → "Secrets":

Add these 3 secrets:
- `CFBD_API_KEY` = (your CFBD API key from collegefootballdata.com)
- `SUPABASE_URL` = `https://zgdaqbnpgrabbxljmiqy.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = (from Supabase Dashboard → Settings → API → service_role key)

---

## Function 2: update-game-stats

1. Click **"New Edge Function"** again
2. Function name: `update-game-stats`
3. Copy and paste this entire file: `supabase/functions/update-game-stats/index.ts`
4. Click **"Deploy"**

**Set Environment Secrets:**
After deployment, add these 2 secrets:
- `SUPABASE_URL` = `https://zgdaqbnpgrabbxljmiqy.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = (same service_role key as above)

---

## Step 2: Set Up Automatic Triggers (pg_cron)

**Go to SQL Editor:**
https://supabase.com/dashboard/project/zgdaqbnpgrabbxljmiqy/sql/new

**Run these 3 SQL commands (one at a time):**

### 1. Enable pg_cron:
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

### 2. Schedule Live Scoring (Thu-Sat):

**IMPORTANT: Replace YOUR_SERVICE_ROLE_KEY with your actual service role key**

```sql
SELECT cron.schedule(
  'live-scoring-thu-sat',
  '*/5 0-5 * * 5-7',
  $$
  SELECT
    net.http_post(
      url := 'https://zgdaqbnpgrabbxljmiqy.supabase.co/functions/v1/live-score-updater',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

### 3. Schedule Live Scoring (Sunday morning):
```sql
SELECT cron.schedule(
  'live-scoring-sunday',
  '*/5 6-13 * * 0',
  $$
  SELECT
    net.http_post(
      url := 'https://zgdaqbnpgrabbxljmiqy.supabase.co/functions/v1/live-score-updater',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

### 4. Schedule Game Statistics (Saturday 11am CT):
```sql
SELECT cron.schedule(
  'update-game-statistics',
  '0 16 * * 6',
  $$
  SELECT
    net.http_post(
      url := 'https://zgdaqbnpgrabbxljmiqy.supabase.co/functions/v1/update-game-stats',
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

## Step 3: Test It Works!

### Test live-score-updater:

Run this in your terminal (or use a tool like Postman):

```bash
curl -X POST https://zgdaqbnpgrabbxljmiqy.supabase.co/functions/v1/live-score-updater \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

You should see a JSON response with:
```json
{
  "success": true,
  "message": "Live update complete: X games updated",
  "gamesChecked": 6,
  "gamesUpdated": 2,
  ...
}
```

### Test update-game-stats:
```bash
curl -X POST https://zgdaqbnpgrabbxljmiqy.supabase.co/functions/v1/update-game-stats \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

---

## Where to Find Your Keys

### Service Role Key:
1. Go to https://supabase.com/dashboard/project/zgdaqbnpgrabbxljmiqy/settings/api
2. Look for "Project API keys"
3. Copy the **service_role** key (NOT the anon key)
4. It starts with `eyJhbG...`

### CFBD API Key:
1. Go to https://collegefootballdata.com
2. Sign in
3. Go to "API Key" section
4. Copy your key

---

## Verify It's Working

### Check Cron Jobs:

In SQL Editor, run:
```sql
SELECT * FROM cron.job;
```

You should see 3 jobs:
- `live-scoring-thu-sat`
- `live-scoring-sunday`
- `update-game-statistics`

### Check Execution History:
```sql
SELECT
  jobname,
  status,
  return_message,
  start_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

---

## Done! 🎉

Once this is set up:

✅ **Live scores update automatically** every 5 minutes during game hours
✅ **Game stats update automatically** every Saturday at 11am CT
✅ **Everything works even when nobody is using the site**

You can still manually trigger updates from the Admin Dashboard whenever you want!
