# Supabase Edge Functions

This directory contains Supabase Edge Functions for automated live scoring and game statistics.

## Functions

### 1. `live-score-updater`
**Purpose**: Automatically fetch and update live game scores from CFBD API

**Schedule**:
- Thursday 6pm - Sunday 8am Central Time
- Every 5 minutes during game hours

**What it does**:
- Fetches live scores from CollegeFootballData.com API
- Updates game scores, status, quarter, and game clock
- Calculates winner against spread when games complete
- Processes picks and awards points
- Returns update summary

**Environment Variables**:
- `CFBD_API_KEY` - CollegeFootballData.com API key
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access

### 2. `update-game-stats`
**Purpose**: Automatically update game pick statistics at pick closure

**Schedule**:
- Every Saturday at 11:00 AM Central Time (16:00 UTC)

**What it does**:
- Calls `scheduled_game_statistics()` database function
- Updates pick counts (home/away, regular/lock picks)
- Calculates pick percentages
- Returns statistics summary

**Environment Variables**:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access

### 3. `process-reminders`
**Purpose**: Automatically send scheduled email reminders

**Schedule**:
- Every 15 minutes during active hours (6 AM - 11 PM CT)

**What it does**:
- Queries `email_jobs` table for pending reminders
- Sends emails via Resend API
- Updates job status (sent/failed)

**Environment Variables**:
- `RESEND_API_KEY` - Resend API key for sending emails
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for database access

## Deployment

### Deploy All Functions
```bash
npx supabase functions deploy live-score-updater
npx supabase functions deploy update-game-stats
npx supabase functions deploy process-reminders
```

### Deploy Single Function
```bash
npx supabase functions deploy [function-name]
```

## Testing

### Test Locally
```bash
# Start local Supabase
npx supabase start

# Serve function locally
npx supabase functions serve live-score-updater

# Call local function
curl http://localhost:54321/functions/v1/live-score-updater
```

### Test Production
```bash
curl -X POST https://YOUR_PROJECT_ID.supabase.co/functions/v1/live-score-updater \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

## Monitoring

### View Logs
1. Go to Supabase Dashboard
2. Navigate to Edge Functions
3. Select the function
4. Click the "Logs" tab

### Check Cron Job Status
```sql
-- View scheduled jobs
SELECT * FROM cron.job;

-- View execution history
SELECT * FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 20;
```

## Setup Instructions

See [AUTOMATED_LIVE_SCORING_SETUP.md](../../AUTOMATED_LIVE_SCORING_SETUP.md) for complete setup instructions including:
- Environment variable configuration
- pg_cron scheduling
- Testing and verification
- Troubleshooting

## Architecture

```
┌─────────────┐
│   pg_cron   │ (Supabase PostgreSQL)
└──────┬──────┘
       │ Triggers on schedule
       ▼
┌─────────────────────┐
│  Edge Functions     │ (Deno runtime)
│  - live-score-updater
│  - update-game-stats
│  - process-reminders
└──────┬──────────────┘
       │
       ├─────► CFBD API (live scores)
       ├─────► Resend API (emails)
       └─────► Database Functions
```

## Key Features

✅ **Automatic Execution** - Runs on schedule without manual intervention
✅ **Reliable** - Server-side, doesn't require browser to be open
✅ **Scalable** - Easy to add new functions or adjust schedules
✅ **Monitored** - Full logging and execution history
✅ **Secure** - Uses service role keys, not exposed to client

## Troubleshooting

### Function Returns 401/403
- Verify `SUPABASE_SERVICE_ROLE_KEY` is the service role key (NOT anon key)
- Check environment variables are set in Supabase Dashboard

### Function Times Out
- Check CFBD API response time
- Verify database functions are optimized
- Consider increasing function timeout in Supabase settings

### No Updates Happening
- Check `cron.job_run_details` for execution errors
- Verify pg_cron is enabled: `SELECT * FROM pg_extension WHERE extname = 'pg_cron'`
- Ensure active week exists: `SELECT * FROM week_settings WHERE picks_open = true`

### CFBD API Errors
- Verify API key is valid
- Check API rate limits (200 calls/hour on free tier)
- Confirm season/week parameters are correct

## Support

For issues or questions:
- Check function logs in Supabase Dashboard
- Review setup documentation
- Contact: admin@pigskinpicksix.com
