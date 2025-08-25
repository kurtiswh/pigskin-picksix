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

    // Query for reminder emails that are due to be sent
    const { data: dueEmails, error: queryError } = await supabase
      .from('email_jobs')
      .select('*')
      .eq('status', 'pending')
      .in('template_type', ['pick_reminder', 'deadline_alert'])
      .lte('scheduled_for', now.toISOString())
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
    for (const email of dueEmails) {
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