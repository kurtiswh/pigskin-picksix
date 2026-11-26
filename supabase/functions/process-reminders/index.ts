import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@2.0.0'
import { renderJobPayload, type RenderContext } from '../_shared/renderJob.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const FROM = 'Pigskin Pick Six <admin@pigskinpicksix.com>'

/**
 * How many emails one run sends. cron calls this every two minutes and waits up
 * to 55 seconds for it (run_reminder_processor, migration 261), so a batch has
 * to finish well inside that: 100 sends at roughly a quarter second each.
 * A 500-player reminder slot therefore drains in about ten minutes.
 */
const BATCH = 100
/** Gap between sends, to stay under Resend's requests-per-second limit. */
const PAUSE_MS = 120
/** Stop starting new sends after this long and hand the rest to the next run. */
const RUN_BUDGET_MS = 45_000

/** A row handed over by claim_due_reminder_emails / claim_unsubmit_notice. */
interface ClaimedJob {
  job_id: string
  to_email: string
  job_type: string
  job_subject: string | null
  job_payload: Record<string, unknown> | null
  job_week: number | null
  job_season: number | null
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

/**
 * Resend said "not now" rather than "no": a rate limit or an exhausted quota.
 * The job is fine and must not be marked failed; it goes back in the queue.
 */
function isThrottle(err: { name?: string; message?: string; statusCode?: number }): boolean {
  if (err.statusCode === 429) return true
  return /rate_limit|quota|too many requests/i.test(`${err.name ?? ''} ${err.message ?? ''}`)
}

const isQuota = (err: { name?: string; message?: string }) =>
  /quota/i.test(`${err.name ?? ''} ${err.message ?? ''}`)

/**
 * Sends reminder-class email: "picks due soon", the saved-but-not-submitted
 * nudge, and the notice that a sheet was just unsubmitted.
 *
 * This function no longer decides WHO gets an email. That moved into SQL
 * (migration 261) because the old loop asked the database two questions per job
 * and stopped after 50 jobs, and a reminder slot is about 500 jobs, most of
 * them for players who have already submitted. The rest sat pending forever:
 * 865 of 14,148 reminders sent in 2026. claim_due_reminder_emails now cancels
 * everything that should not send (already submitted, not paid, deadline
 * passed, hours late, over the monthly ceiling) in a handful of statements and
 * returns only what should go out, already claimed so an overlapping run cannot
 * send it twice.
 *
 * Two ways in:
 *   {}            the cron path: take the next batch of due jobs.
 *   { jobId }     one unsubmit notice, called by the picks trigger the moment
 *                 the unsubmit commits (migration 262), so the notice lands
 *                 before the player has had time to submit again.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const started = Date.now()

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable not set')
    }

    const resend = new Resend(resendApiKey)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    let body: { jobId?: unknown } = {}
    try {
      body = await req.json()
    } catch {
      // cron posts '{}', but an empty body is just as valid
    }

    const single = typeof body?.jobId === 'string' ? body.jobId : null
    const { data, error: claimError } = single
      ? await supabase.rpc('claim_unsubmit_notice', { p_job_id: single })
      : await supabase.rpc('claim_due_reminder_emails', { p_limit: BATCH })

    if (claimError) {
      console.error('❌ Could not claim reminder jobs:', claimError)
      throw new Error(claimError.message)
    }

    const jobs = (data ?? []) as ClaimedJob[]
    console.log(`📧 ${single ? 'Unsubmit notice' : 'Reminder run'}: ${jobs.length} to send`)

    let sent = 0
    let failed = 0
    let released = 0
    let stoppedBy: string | null = null

    /** Hand unsent jobs back so the next run takes them now, not in ten minutes. */
    const release = async (ids: string[]) => {
      if (ids.length === 0) return
      const { error } = await supabase.rpc('release_reminder_claims', { p_ids: ids })
      if (error) console.error('❌ Could not release claims:', error)
      released += ids.length
    }

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]

      if (Date.now() - started > RUN_BUDGET_MS) {
        stoppedBy = 'time budget'
        await release(jobs.slice(i).map(j => j.job_id))
        break
      }

      try {
        // Jobs are queued with html_content NULL on purpose: the server owns
        // the content and renders it here from the payload.
        const rendered = renderJobPayload(job.job_type, job.job_payload, {} as RenderContext)

        const result = await resend.emails.send({
          from: FROM,
          to: [job.to_email],
          subject: rendered.subject || job.job_subject || 'Pigskin Pick Six',
          html: rendered.html,
          text: rendered.text,
        })

        if (result.error) {
          if (isThrottle(result.error)) {
            console.warn(`⏸️ Resend is throttling (${result.error.message}); stopping this run`)
            stoppedBy = result.error.message || 'throttled'
            await release(jobs.slice(i).map(j => j.job_id))
            if (isQuota(result.error)) {
              // An exhausted quota blocks pick confirmations too. Tell someone.
              await supabase.rpc('record_email_health_alert', {
                p_kind: 'resend_quota',
                p_details: { summary: `Resend refused a send: ${result.error.message}` },
              })
            }
            break
          }

          console.error(`❌ Resend error for ${job.job_id}:`, result.error)
          await supabase
            .from('email_jobs')
            .update({ status: 'failed', error_message: result.error.message })
            .eq('id', job.job_id)
          failed++
        } else {
          await supabase
            .from('email_jobs')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              external_message_id: result.data?.id ?? null,
            })
            .eq('id', job.job_id)
          sent++
        }
      } catch (jobError) {
        console.error(`❌ Error sending ${job.job_id}:`, jobError)
        await supabase
          .from('email_jobs')
          .update({
            status: 'failed',
            error_message: jobError instanceof Error ? jobError.message : 'Unknown error',
          })
          .eq('id', job.job_id)
        failed++
      }

      await new Promise(resolve => setTimeout(resolve, PAUSE_MS))
    }

    console.log(`🏁 Done: ${sent} sent, ${failed} failed, ${released} released${stoppedBy ? ` (stopped: ${stoppedBy})` : ''}`)

    return json({
      success: true,
      claimed: jobs.length,
      sent,
      failed,
      released,
      stoppedBy,
      ms: Date.now() - started,
    })
  } catch (error) {
    console.error('❌ process-reminders failed:', error)
    return json({
      error: 'process-reminders failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
})
