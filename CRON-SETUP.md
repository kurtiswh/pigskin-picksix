# Live Score Auto-Update Setup

## Problem
GitHub Actions scheduled workflows are unreliable:
- Delayed 10-15 minutes during high load
- Disabled after 60 days of repository inactivity
- Often skipped during peak times
- New workflows take 1+ hour to start auto-triggering

## Solution: External Cron Service

Use a free external cron service to reliably trigger the Edge Function every 5 minutes.

### Option 1: cron-job.org (Recommended - Free Forever)

1. **Sign up**: https://cron-job.org/en/signup/
2. **Create a new cron job**:
   - Title: `Live Score Updater`
   - URL: `https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/live-score-updater`
   - Schedule: `*/5 * * * *` (every 5 minutes)
   - Execution: Only during game hours (set time windows below)

3. **Set time windows** (Central Time = UTC-6):
   - **Thursday**: 00:00 - 06:00 UTC (6pm - midnight CT)
   - **Friday**: 00:00 - 06:00 UTC (6pm - midnight CT)
   - **Saturday**: 17:00 - 23:59 UTC + 00:00 - 06:00 UTC (11am - midnight CT)
   - **Sunday**: 00:00 - 14:00 UTC (6pm Sat - 8am Sun CT)

4. **HTTP Headers**:
   ```
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8
   Content-Type: application/json
   ```

5. **Method**: POST

### Option 2: EasyCron (Free - 1 job)

1. **Sign up**: https://www.easycron.com/
2. **Create cron job**:
   - URL: `https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/live-score-updater`
   - Cron expression: `*/5 * * * *`
   - Method: POST
   - Headers: Same as above

### Option 3: UptimeRobot (Free - Monitor + Cron)

1. **Sign up**: https://uptimerobot.com/
2. **Create monitor**:
   - Type: HTTP(s)
   - URL: `https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/live-score-updater`
   - Interval: 5 minutes
   - Custom HTTP Headers: Same as above

## Testing

Test the Edge Function manually:

```bash
curl -X POST \
  https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/live-score-updater \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZGFxYm5wZ3JhYmJubGptaXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM4NDU2MjgsImV4cCI6MjA2OTQyMTYyOH0.DCpIOdBbzQ0pPyk5WpfrKrcRxi49oyMccHCzP-T14w8" \
  -H "Content-Type: application/json"
```

Expected response:
```json
{
  "success": true,
  "message": "Live update complete: X games updated, Y newly completed",
  "gamesChecked": X,
  "gamesUpdated": Y,
  "newlyCompleted": Z,
  "errors": []
}
```

## Monitoring

View cron job execution logs in:
- cron-job.org: Job History tab
- Supabase: Functions → live-score-updater → Logs

## Why This Works Better

✅ **Reliable**: External services are designed for cron jobs
✅ **No throttling**: Runs exactly every 5 minutes
✅ **No setup delay**: Works immediately after setup
✅ **Free**: All options have free tiers
✅ **Monitoring**: Built-in execution logs and alerts

## Disable GitHub Actions (Optional)

Once external cron is working, you can disable the GitHub Actions workflow:
1. Go to repository Settings → Actions → General
2. Set "Actions permissions" to "Disable actions"
3. Or delete `.github/workflows/auto-update-games.yml`

This saves GitHub Actions minutes and eliminates the unreliable workflow.
