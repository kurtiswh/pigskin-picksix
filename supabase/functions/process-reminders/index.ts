import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@2.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EmailJob {
  id: string
  email: string
  subject: string
  html_content: string
  scheduled_for: string
  template_type: string
  status: string
  user_id: string | null
  created_at: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('🕐 Processing reminder emails cron job started')
    
    // Get environment variables
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable not set')
    }

    // Initialize clients
    const resend = new Resend(resendApiKey)
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get current time
    const now = new Date()
    console.log(`📅 Current time: ${now.toISOString()}`)

    // Staleness floor: never send a reminder that is already this far past its
    // scheduled_for time. A reminder that late is meaningless (the deadline has
    // long passed) and blindly draining an old backlog would spam users — as
    // happened when a cron timeout fix released ~10k stale 2025 jobs.
    const STALE_THRESHOLD_HOURS = 6
    const staleFloor = new Date(now.getTime() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000)
    console.log(`⏳ Ignoring reminders scheduled before ${staleFloor.toISOString()} (>${STALE_THRESHOLD_HOURS}h late)`)

    // Query for reminder emails that are due to be sent (and not stale)
    const { data: dueEmails, error: queryError } = await supabase
      .from('email_jobs')
      .select('*')
      .eq('status', 'pending')
      .in('template_type', ['pick_reminder', 'deadline_alert', 'picks_unsubmitted'])
      .lte('scheduled_for', now.toISOString())
      .gte('scheduled_for', staleFloor.toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(50) // Process max 50 emails per run

    if (queryError) {
      console.error('❌ Error querying due emails:', queryError)
      throw queryError
    }

    console.log(`📧 Found ${dueEmails?.length || 0} reminder emails due to be sent`)

    if (!dueEmails || dueEmails.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No reminder emails due to be sent',
          processed: 0,
          errors: 0 
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    let processed = 0
    let errors = 0

    // Process each due email
    // Re-check submission at SEND time, not just queue time. Cancel-on-submit
    // covers the normal path, but a submit that bypassed it (an admin edit, a
    // direct API call) would otherwise still trigger "your picks aren't in".
    const candidates = dueEmails ?? []
    const reminderish = candidates.filter(j =>
      ['pick_reminder', 'deadline_alert', 'picks_unsubmitted'].includes(j.template_type))
    const skipIds = new Set<string>()
    for (const j of reminderish) {
      if (!j.user_id || j.week == null || j.season == null) continue
      const { data: sub } = await supabase
        .from('picks')
        .select('id')
        .eq('user_id', j.user_id).eq('week', j.week).eq('season', j.season)
        .eq('submitted', true)
        .limit(1)
      if (sub && sub.length > 0) {
        skipIds.add(j.id)
        await supabase.from('email_jobs').update({ status: 'cancelled' }).eq('id', j.id)
        console.log(`⏭️ Skipping ${j.template_type} for ${j.email} — already submitted`)
        continue
      }

      // "Picks due soon" goes to paid entries only, re-checked HERE rather than
      // trusting the queue-time audience: a register re-upload can flip someone
      // to NotPaid after their job was queued. picks_unsubmitted is deliberately
      // exempt -- picks count during the grace period regardless of payment, and
      // that email never mentions money.
      if (j.template_type === 'pick_reminder' || j.template_type === 'deadline_alert') {
        const { data: paid } = await supabase
          .from('leaguesafe_payments')
          .select('id')
          .eq('user_id', j.user_id).eq('season', j.season).eq('status', 'Paid')
          .limit(1)
        if (!paid || paid.length === 0) {
          skipIds.add(j.id)
          await supabase.from('email_jobs').update({ status: 'cancelled' }).eq('id', j.id)
          console.log(`⏭️ Skipping ${j.template_type} for ${j.email} — not marked paid`)
        }
      }
    }

    for (const email of (dueEmails ?? []).filter(j => !skipIds.has(j.id))) {
      try {
        console.log(`📤 Sending reminder email ${email.id} to ${email.email}`)
        
        // Send email via Resend
        const emailData = {
          from: 'Pigskin Pick Six <admin@pigskinpicksix.com>',
          to: [email.email],
          subject: email.subject,
          html: email.html_content,
          text: email.html_content.replace(/<[^>]*>/g, ''), // Strip HTML for text fallback
        }

        const result = await resend.emails.send(emailData)

        if (result.error) {
          console.error(`❌ Resend error for email ${email.id}:`, result.error)
          
          // Mark as failed
          await supabase
            .from('email_jobs')
            .update({
              status: 'failed',
              error_message: result.error.message,
              sent_at: new Date().toISOString()
            })
            .eq('id', email.id)
          
          errors++
        } else {
          console.log(`✅ Email ${email.id} sent successfully:`, result.data?.id)
          
          // Mark as sent
          await supabase
            .from('email_jobs')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
              external_message_id: result.data?.id
            })
            .eq('id', email.id)
          
          processed++
        }

        // Small delay between emails to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))

      } catch (emailError) {
        console.error(`❌ Error processing email ${email.id}:`, emailError)
        
        // Mark as failed
        await supabase
          .from('email_jobs')
          .update({
            status: 'failed',
            error_message: emailError instanceof Error ? emailError.message : 'Unknown error',
            sent_at: new Date().toISOString()
          })
          .eq('id', email.id)
        
        errors++
      }
    }

    console.log(`🏁 Cron job completed: ${processed} emails sent, ${errors} errors`)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Processed ${processed} reminder emails with ${errors} errors`,
        processed,
        errors,
        timestamp: now.toISOString()
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('❌ Cron job error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})