// Vercel serverless function for sending password reset emails via Resend
import { Resend } from 'resend'

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('Password reset API called')
    
    // Check if API key is available (try both RESEND_API_KEY and VITE_RESEND_API_KEY)
    const resendApiKey = process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY environment variable not set')
      console.error('Checked: RESEND_API_KEY and VITE_RESEND_API_KEY')
      return res.status(500).json({ error: 'Email service not configured' })
    }

    console.log('RESEND_API_KEY length:', resendApiKey.length)
    console.log('RESEND_API_KEY starts with:', resendApiKey.substring(0, 7))

    const resend = new Resend(resendApiKey)
    
    const { email, token } = req.body

    if (!email || !token) {
      console.error('Missing email or token in request body')
      return res.status(400).json({ error: 'Email and token are required' })
    }

    console.log(`Sending password reset email to: ${email}`)

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      console.error(`Invalid email format: ${email}`)
      return res.status(400).json({ error: 'Invalid email format' })
    }

    const resetUrl = `https://pigskin-picksix.vercel.app/reset-password?token=${token}&email=${encodeURIComponent(email)}`
    const displayName = email.split('@')[0]

    console.log('Attempting to send email via Resend...')
    console.log('Email details:', { email, hasToken: !!token })
    
    const { data, error } = await resend.emails.send({
      from: 'Pigskin Pick 6 Pro <admin@pigskinpicksix.com>', // Using custom domain
      to: [email],
      subject: 'Password Reset Request - Pigskin Pick 6 Pro',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          
          <p style="color: #555; font-size: 16px;">
            Hi ${displayName},
          </p>
          
          <p style="color: #555; font-size: 16px;">
            We received a request to reset your password for Pigskin Pick 6 Pro. Click the button below to create a new password:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #8B4513; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; font-size: 16px;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #555; font-size: 14px;">
            If you didn't request this password reset, you can safely ignore this email.
          </p>
          
          <p style="color: #777; font-size: 12px; margin-top: 30px;">
            This link will expire in 1 hour for security reasons.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <span style="color: #8B4513;">${resetUrl}</span>
          </p>
        </div>
      `,
      text: `
Password Reset Request - Pigskin Pick 6 Pro

Hi ${displayName},

We received a request to reset your password for Pigskin Pick 6 Pro.

To create a new password, please visit:
${resetUrl}

If you didn't request this password reset, you can safely ignore this email.

This link will expire in 1 hour for security reasons.

The Pigskin Pick 6 Pro Team
      `.trim(),
    })

    if (error) {
      console.error('Resend API error:', error)
      console.error('Full error object:', JSON.stringify(error, null, 2))
      return res.status(500).json({ 
        error: 'Failed to send email', 
        details: error.message,
        errorType: error.name,
        resendError: error,
        fullError: JSON.stringify(error)
      })
    }

    console.log('Password reset email sent successfully!')
    console.log('Resend response data:', JSON.stringify(data, null, 2))
    return res.status(200).json({ 
      success: true, 
      messageId: data?.id,
      fullData: data 
    })

  } catch (error) {
    console.error('Exception in password reset API:', error)
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}