import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@2.0.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface EmailRequest {
  to: string
  subject: string  
  html: string
  text?: string
  from?: string
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY environment variable not set')
    }

    // Initialize Resend client
    const resend = new Resend(resendApiKey)
    
    // Initialize Supabase client with service key for admin access
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ 
          error: 'No authorization header',
          details: 'Include Authorization: Bearer <token> header'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      console.log('Authentication error:', authError)
      return new Response(
        JSON.stringify({ 
          error: 'Invalid authentication',
          details: authError?.message || 'User not found',
          token_provided: token ? 'yes' : 'no'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📧 Authenticated user: ${user.email} (${user.id})`)

    // Parse request body
    const body: EmailRequest = await req.json()
    const { to, subject, html, text, from } = body

    // Validate request
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send email via Resend
    const emailData = {
      from: from || 'Pigskin Pick Six <admin@pigskinpicksix.com>',
      to: [to],
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''), // Strip HTML for text fallback
    }

    console.log(`📧 Sending email to ${to}: ${subject}`)
    const result = await resend.emails.send(emailData)

    if (result.error) {
      console.error('❌ Resend error:', result.error)
      throw new Error(`Resend API error: ${result.error.message}`)
    }

    console.log('✅ Email sent successfully:', result.data?.id)

    return new Response(
      JSON.stringify({ 
        success: true, 
        messageId: result.data?.id,
        message: 'Email sent successfully' 
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('❌ Email sending error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to send email',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})