// Vercel serverless function for sending password reset emails via Resend
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email, token } = req.body

    if (!email || !token) {
      return res.status(400).json({ error: 'Email and token are required' })
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' })
    }

    const resetUrl = `https://pigskin-picksix.vercel.app/reset-password?token=${token}`
    const displayName = email.split('@')[0]

    const { data, error } = await resend.emails.send({
      from: 'Pigskin Pick 6 Pro <noreply@pigskinpick6.com>', // Update with your verified domain
      to: [email],
      subject: '🔐 Password Reset Request - Pigskin Pick 6 Pro',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #8B4513; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">🔐 Password Reset</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick 6 Pro</p>
          </div>
          
          <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h2 style="color: #1f2937; margin-top: 0;">Hi ${displayName}!</h2>
            
            <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
              A password reset has been requested for your Pigskin Pick 6 Pro account. If you didn't request this reset, you can safely ignore this email.
            </p>
            
            <div style="background-color: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
              <h3 style="color: #1e40af; margin-top: 0; font-size: 18px;">
                🔑 Reset Your Password
              </h3>
              <p style="color: #1e3a8a; margin: 10px 0; font-size: 14px;">
                Click the button below to create a new password for your account.
              </p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background-color: #8B4513; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
                Reset Password
              </a>
            </div>
            
            <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <h4 style="color: #92400e; margin-top: 0; font-size: 14px;">⚠️ Security Notice:</h4>
              <div style="color: #92400e; font-size: 13px; line-height: 1.5;">
                <p style="margin: 5px 0;">• This link will expire in 1 hour for security</p>
                <p style="margin: 5px 0;">• If you didn't request this, please contact an admin</p>
                <p style="margin: 5px 0;">• Never share this reset link with anyone</p>
              </div>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
              If the button doesn't work, copy and paste this link:<br>
              <span style="word-break: break-all; color: #3b82f6;">${resetUrl}</span>
            </p>
            
            <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 20px;">
              <em>The Pigskin Pick 6 Pro Team</em>
            </p>
          </div>
        </div>
      `,
      text: `
🔐 PASSWORD RESET - Pigskin Pick 6 Pro

Hi ${displayName}!

A password reset has been requested for your Pigskin Pick 6 Pro account. If you didn't request this reset, you can safely ignore this email.

🔑 RESET YOUR PASSWORD
Click this link to create a new password: ${resetUrl}

⚠️ SECURITY NOTICE:
• This link will expire in 1 hour for security
• If you didn't request this, please contact an admin  
• Never share this reset link with anyone

The Pigskin Pick 6 Pro Team
      `.trim(),
    })

    if (error) {
      console.error('Resend error:', error)
      return res.status(500).json({ error: 'Failed to send email' })
    }

    console.log('Password reset email sent successfully:', data?.id)
    return res.status(200).json({ success: true, messageId: data?.id })

  } catch (error) {
    console.error('Error sending password reset email:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}