import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@2.0.0'
import { renderJobPayload } from '../_shared/renderJob.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Who is calling, and therefore what they may ask for.
 *
 *   service — the service-role key: cron jobs and schedulers. Full trust.
 *   admin   — a signed-in user with users.is_admin. Sends the recap blast and
 *             preseason test mails, both rendered in the admin's browser.
 *   user    — any other signed-in player.
 *   anon    — the public anon key, i.e. an unauthenticated visitor.
 *
 * Only `service` and `admin` may hand this function an email body. Everyone
 * else may only name a queued job (`jobId`), whose recipient and content the
 * server derives for itself. This is the whole point of the file: before, a
 * caller merely had to present a string starting with "eyJ" to send arbitrary
 * HTML to an arbitrary address over the pigskinpicksix.com domain.
 */
type Caller = 'service' | 'admin' | 'user' | 'anon'

interface ContentRequest {
  to: string
  subject: string
  html: string
  text?: string
  from?: string
  /** Recipient's opt-out URL — adds a List-Unsubscribe header (bulk sends only). */
  unsubscribeUrl?: string
}

interface JobRequest {
  /** id of an email_jobs row; the server reads recipient and body from it. */
  jobId: string
  /** One-time secret returned alongside the job id by the queue_* RPCs. */
  sendToken?: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const DEFAULT_FROM = 'Pigskin Pick Six <admin@pigskinpicksix.com>'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable not set')
    }

    const resend = new Resend(resendApiKey)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // ── Identify the caller ────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({
        error: 'No authorization header',
        details: 'Include Authorization: Bearer <token> header',
      }, 401)
    }

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    let caller: Caller
    let userId: string | null = null

    if (supabaseServiceKey && token === supabaseServiceKey) {
      caller = 'service'
    } else {
      const { data: { user: authUser } } = await supabase.auth.getUser(token)
      if (authUser) {
        userId = authUser.id
        const { data: profile } = await supabase
          .from('users')
          .select('is_admin')
          .eq('id', authUser.id)
          .maybeSingle()
        caller = profile?.is_admin ? 'admin' : 'user'
        console.log(`📧 Caller: ${caller} — ${authUser.email} (${authUser.id})`)
      } else {
        // A project key rather than a session. The platform gateway validates
        // the JWT's signature before anything reaches this function, so a token
        // that gets here is genuinely ours — but it is NOT matched against the
        // anon key by value: this project still uses a legacy anon key while
        // SUPABASE_ANON_KEY holds the current one, so comparing them rejects
        // the very callers the anonymous flow depends on.
        //
        // Treating an unrecognized token as the least-privileged caller is the
        // safe direction. `anon` cannot supply content at all; the most it can
        // do is send one already-queued, server-rendered job whose one-time
        // send_token it already holds. Even with gateway verification off, that
        // is a pair of unguessable UUIDs, not a way to send arbitrary mail.
        caller = 'anon'
        console.log(`📧 Caller: anon (project key${supabaseAnonKey && token === supabaseAnonKey ? '' : ', non-matching'})`)
      }
    }

    const mayProvideContent = caller === 'service' || caller === 'admin'

    // ── Work out what to send ──────────────────────────────────────────────
    const body = await req.json() as Partial<ContentRequest & JobRequest>

    let to: string
    let subject: string
    let html: string
    let text: string
    let from = DEFAULT_FROM
    let unsubscribeUrl: string | undefined
    let jobToMarkSent: string | null = null

    if (body.jobId) {
      // ---- Job mode: the server owns recipient and content ----
      const { data: job, error: jobError } = await supabase
        .from('email_jobs')
        .select('id, user_id, email, template_type, subject, html_content, text_content, payload, status, send_token')
        .eq('id', body.jobId)
        .maybeSingle()

      if (jobError || !job) {
        return json({ error: 'Job not found', details: jobError?.message }, 404)
      }

      if (job.status === 'sent') {
        // Idempotent: a retry after a dropped response must not double-send.
        return json({ success: true, message: 'Job already sent', alreadySent: true })
      }
      if (job.status === 'cancelled') {
        return json({ error: 'Job is cancelled' }, 409)
      }

      // Authorize this specific job for this specific caller.
      if (caller === 'anon') {
        // An anon caller proves it owns the job with the one-time token the
        // RPC handed back, so guessing or listing job ids buys nothing.
        if (!job.send_token || !body.sendToken || body.sendToken !== job.send_token) {
          return json({ error: 'Invalid or missing sendToken for this job' }, 403)
        }
      } else if (caller === 'user') {
        if (!job.user_id || job.user_id !== userId) {
          const tokenOk = job.send_token && body.sendToken && body.sendToken === job.send_token
          if (!tokenOk) {
            return json({ error: 'Job does not belong to this user' }, 403)
          }
        }
      }

      if (mayProvideContent && !job.payload) {
        // Cron and admin tooling still queue pre-rendered jobs.
        if (!job.html_content) {
          return json({ error: 'Job has neither payload nor html_content' }, 422)
        }
        subject = job.subject
        html = job.html_content
        text = job.text_content || job.html_content.replace(/<[^>]*>/g, '')
      } else {
        // For user and anon callers the stored html_content is untrusted —
        // they can write that column directly — so it is never sent. Only a
        // server-derived payload is renderable.
        if (!job.payload) {
          return json({
            error: 'Job is not server-rendered',
            details: 'Only jobs queued with a payload can be sent by this caller',
          }, 403)
        }
        const rendered = renderJobPayload(job.template_type, job.payload)
        subject = rendered.subject
        html = rendered.html
        text = rendered.text
      }

      to = job.email
      jobToMarkSent = job.id
    } else {
      // ---- Content mode: privileged callers only ----
      if (!mayProvideContent) {
        return json({
          error: 'Not permitted to supply email content',
          details: 'Queue the email first, then call this function with { jobId }',
        }, 403)
      }

      if (!body.to || !body.subject || !body.html) {
        return json({ error: 'Missing required fields: to, subject, html' }, 400)
      }

      to = body.to
      subject = body.subject
      html = body.html
      text = body.text || body.html.replace(/<[^>]*>/g, '')
      from = body.from || DEFAULT_FROM
      unsubscribeUrl = body.unsubscribeUrl
    }

    // ── Send ───────────────────────────────────────────────────────────────
    const emailData: Record<string, unknown> = { from, to: [to], subject, html, text }

    // Bulk sends pass the recipient's opt-out URL. The List-Unsubscribe header
    // turns on the mail client's own native "Unsubscribe" control, which
    // diverts people away from the spam button and protects domain reputation.
    // No List-Unsubscribe-Post: one-click requires a POST endpoint, and the
    // unsubscribe page is a static SPA route that only answers GET.
    if (unsubscribeUrl) {
      emailData.headers = {
        'List-Unsubscribe': `<${unsubscribeUrl}>, <mailto:admin@pigskinpicksix.com?subject=unsubscribe>`,
      }
    }

    console.log(`📧 Sending email to ${to}: ${subject}`)
    const result = await resend.emails.send(emailData)

    if (result.error) {
      console.error('❌ Resend error:', result.error)
      if (jobToMarkSent) {
        await supabase
          .from('email_jobs')
          .update({
            status: 'failed',
            error_message: result.error.message,
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobToMarkSent)
      }
      throw new Error(`Resend API error: ${result.error.message}`)
    }

    console.log('✅ Email sent successfully:', result.data?.id)

    if (jobToMarkSent) {
      // Clearing send_token retires the one-time secret with the send.
      await supabase
        .from('email_jobs')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          attempts: 1,
          send_token: null,
        })
        .eq('id', jobToMarkSent)
    }

    return json({
      success: true,
      messageId: result.data?.id,
      message: 'Email sent successfully',
    })

  } catch (error) {
    console.error('❌ Email sending error:', error)
    return json({
      error: 'Failed to send email',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, 500)
  }
})
