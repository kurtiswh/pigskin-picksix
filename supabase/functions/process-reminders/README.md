# Process Reminders Cron Function

This Supabase Edge Function automatically processes scheduled reminder emails every 15 minutes during active hours (6 AM - 11 PM CT).

## What It Does

- Queries the `email_jobs` table for reminder emails (`pick_reminder`, `deadline_alert`) that are due to be sent
- Sends up to 50 emails per execution via Resend API
- Updates email job status to `sent` or `failed` based on results
- Runs automatically every 15 minutes during active hours

## Deployment

### 1. Deploy the Function
```bash
# Deploy the function to Supabase
npx supabase functions deploy process-reminders
```

### 2. Set Required Environment Variables
In your Supabase dashboard, go to Edge Functions → process-reminders → Settings and add:
- `RESEND_API_KEY`: Your Resend API key for sending emails
- `SUPABASE_URL`: Your Supabase project URL (usually already set)
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for admin database access

### 3. Configure Cron Schedule

**Option A: Using pg_cron Extension (Recommended)**

1. In Supabase Dashboard, go to **SQL Editor** and run:

```sql
-- Enable pg_cron extension (may already be enabled)
SELECT cron.schedule(
  'process-reminder-emails',
  '0 */15 6-23 * * *',  -- Every 15 minutes from 6 AM to 11 PM
  $$
  SELECT 
    net.http_post(
      url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/process-reminders',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
```

Replace:
- `YOUR_PROJECT_ID` with your actual Supabase project ID (found in Settings → General)
- `YOUR_SERVICE_ROLE_KEY` with your service role key (from Settings → API → service_role key)

**Finding Your Project Details:**
1. In Supabase Dashboard → Settings → General → Reference ID is your `PROJECT_ID`
2. In Supabase Dashboard → Settings → API → Copy the `service_role` key (not anon key)

**Option B: External Cron (GitHub Actions, etc.)**

Create a GitHub Action that runs every 15 minutes:

```yaml
# .github/workflows/process-reminders.yml
name: Process Reminder Emails
on:
  schedule:
    - cron: '0 */15 12-5 * * *'  # Every 15 min, 6AM-11PM CT (UTC+6)
jobs:
  process-reminders:
    runs-on: ubuntu-latest
    steps:
      - name: Call Edge Function
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_SERVICE_KEY }}" \
            https://YOUR_PROJECT_ID.supabase.co/functions/v1/process-reminders
```

### 4. Test the Function
```bash
# Manual test via curl
curl -X POST https://your-project-id.supabase.co/functions/v1/process-reminders \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Or test from the Supabase dashboard function interface
```

## Monitoring

### Check Function Logs
In Supabase Dashboard → Edge Functions → process-reminders → Logs, you'll see:
- `🕐 Processing reminder emails cron job started`
- `📧 Found X reminder emails due to be sent`
- `✅ Email ID sent successfully` or `❌ Error processing email`
- `🏁 Cron job completed: X emails sent, Y errors`

### Monitor Email Jobs Table
```sql
-- Check pending reminders
SELECT * FROM email_jobs 
WHERE status = 'pending' 
  AND email_type IN ('pick_reminder', 'deadline_alert')
  AND scheduled_for <= NOW()
ORDER BY scheduled_for;

-- Check recent sent emails
SELECT * FROM email_jobs 
WHERE status = 'sent' 
  AND email_type IN ('pick_reminder', 'deadline_alert')
  AND sent_at >= NOW() - INTERVAL '1 day'
ORDER BY sent_at DESC;

-- Check failed emails
SELECT * FROM email_jobs 
WHERE status = 'failed' 
  AND email_type IN ('pick_reminder', 'deadline_alert')
ORDER BY created_at DESC;
```

## Schedule Details

- **Frequency**: Every 15 minutes
- **Active Hours**: 6 AM - 11 PM Central Time
- **Max Emails per Run**: 50 (to avoid timeouts)
- **Rate Limiting**: 100ms delay between emails
- **Timezone**: America/Chicago (Central Time)

## Troubleshooting

### Common Issues

1. **No emails being sent**: Check that RESEND_API_KEY is set correctly
2. **Cron not running**: Verify cron schedule is configured in Supabase dashboard
3. **Emails marked as failed**: Check Resend API limits and email format
4. **Function timeout**: Reduce batch size from 50 if processing takes too long

### Manual Processing Fallback

If the cron fails, admins can still manually process the email queue using the "Process Email Queue" button in the Admin Notifications interface.

### Logs and Debugging

Function logs are available in Supabase Dashboard → Edge Functions → process-reminders → Logs. All significant events are logged with emoji prefixes for easy scanning:
- 🕐 Job started
- 📅 Current time
- 📧 Emails found
- 📤 Sending email
- ✅ Success
- ❌ Error
- 🏁 Job completed