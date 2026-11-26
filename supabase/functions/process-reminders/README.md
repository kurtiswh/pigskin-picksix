# process-reminders

Sends reminder-class email through Resend:

| `template_type` | What it is | Queued by |
|---|---|---|
| `pick_reminder`, `deadline_alert` | "Picks due soon", to paid players who have not submitted | `queue_pick_reminders`, when an admin opens the week |
| `picks_unsubmitted` | "Your picks are saved but NOT submitted" | `reminder_sweep`, automatically 3 hours and 1 hour before each deadline |
| `picks_unsubmit_notice` | "Your picks are no longer submitted" | the trigger on `picks`, the moment a submitted sheet is unsubmitted |

Pick confirmations do not come through here; `send-email` sends those.

## How it runs

```
cron (every 2 min)  ->  run_reminder_processor()  ->  process-reminders  ->  Resend
                         |                              |
                         reminder_sweep()               claim_due_reminder_emails(100)
                         (queues the nudge)             (decides what sends)

picks trigger       ->  pg_net  ->  process-reminders { jobId }  ->  claim_unsubmit_notice()
```

The function does not decide who gets an email. `claim_due_reminder_emails`
(migration 261) does, in SQL: it cancels every due job that should not send and
keeps the reason on the row, then claims and returns up to 100 that should.
A job is cancelled when:

- the week's deadline has passed,
- it is more than 3 hours past its scheduled time,
- the player already has a submitted sheet, or a counting anonymous entry,
- the player is not marked Paid (`pick_reminder` and `deadline_alert` only),

and nothing is claimed once the month's sends reach the ceiling in
`reminder_config`.

One run sends up to 100 emails, about 25 seconds. A 500-player slot drains in
roughly ten minutes.

## The schedule, and the mistake not to repeat

```sql
SELECT jobname, schedule, command FROM cron.job
WHERE jobname IN ('process-reminder-emails', 'reminder-watchdog');
-- process-reminder-emails | */2 * * * *      | SELECT public.run_reminder_processor();
-- reminder-watchdog       | 7-59/15 * * * *  | SELECT public.reminder_watchdog();
```

pg_cron takes **five** fields. This README used to recommend
`'0 */15 6-23 * * *'` as "every 15 minutes, 6 AM to 11 PM". A sixth field does
not raise an error. pg_cron read it as minute 0, every 15th hour, days 6 to 23
of the month: twice a day, and never from the 24th to the 5th. That ran for
most of the 2026 season and 865 of 14,148 queued reminders were sent.

## Settings

One row in `reminder_config`:

| Column | Default | Meaning |
|---|---|---|
| `monthly_quota` | 50000 | The Resend plan's monthly allowance. Set this to match the plan. |
| `reminder_ceiling_pct` | 80 | Reminder-class email stops at this share of the quota, so reminders can never crowd out pick confirmations. |
| `nudge_hours` | `{3,1}` | Hours before the deadline at which the saved-but-not-submitted nudge goes out. |
| `alerts_enabled` | true | Whether the watchdog emails anyone. |
| `alert_emails` | empty | Who the watchdog emails. Empty means every admin account. |

Month-to-date is counted from `email_jobs` by calendar month. Resend counts by
billing cycle and also counts mail that never touches `email_jobs` (auth email,
for one), so treat it as a close estimate and leave headroom.

## Is it working?

```sql
SELECT public.reminder_health();
```

Returns the processor's last run and last success, how many reminders are
overdue, how many are scheduled after their own deadline, recent failures,
sends today and this month against the ceiling, and the upcoming slots.

`reminder_watchdog` runs every 15 minutes on its own cron entry and emails
`reminder_config.alert_emails` (every admin, if that is empty) when it finds reminders overdue, reminders scheduled after their
deadline, repeated send failures, a processor that has stopped completing runs,
or the send ceiling reached. Each kind of problem is reported at most once
every six hours. What it found is kept in `email_health_alerts`.

## Deploying

```bash
npm run sync:templates
npx supabase functions deploy process-reminders --project-ref zgdaqbnpgrabbnljmiqy
```

The function imports `../_shared/renderJob.ts`, which imports every email
template, so the shared copies must be in sync first. `npm run check:templates`
verifies that without writing anything.

Environment: `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Testing by hand

```bash
# next batch of due jobs (does nothing when none are due)
curl -X POST https://zgdaqbnpgrabbnljmiqy.supabase.co/functions/v1/process-reminders \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "Content-Type: application/json" -d '{}'
```

The response reports `claimed`, `sent`, `failed`, `released` and, when the run
stopped early, why (`stoppedBy`). A run stops early when Resend throttles it or
when it runs out of time; in both cases the unsent jobs are released for the
next run and are not marked failed.
