import type { PasswordResetData } from './types'

export function getPasswordResetSubject(data: PasswordResetData): string {
  return `🔐 Reset Your Pigskin Pick Six Password`
}

export function getPasswordResetHtml(data: PasswordResetData): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #8B4513; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">🔐 Password Reset</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick Six</p>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Hi ${data.userDisplayName}!</h2>
        
        <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
          We received a request to reset the password for your Pigskin Pick Six account. 
          Click the button below to create a new password.
        </p>
        
        <div style="background-color: #fef2f2; border: 1px solid #f87171; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
          <p style="color: #dc2626; margin: 0 0 15px 0; font-size: 16px;">
            🔒 Reset your password securely
          </p>
          <a href="${data.resetUrl}" 
             style="background-color: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
            Reset Password
          </a>
        </div>
        
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h4 style="color: #92400e; margin-top: 0; font-size: 14px;">⚠️ Security Note</h4>
          <p style="color: #92400e; margin: 0; font-size: 14px;">
            This reset link will expire in 1 hour for your security. If you didn't request a password reset, you can safely ignore this email - your account remains secure.
          </p>
        </div>
        
        <p style="color: #4b5563; font-size: 14px; line-height: 1.5;">
          Having trouble with the button? Copy and paste this link into your browser:<br>
          <span style="color: #6b7280; word-break: break-all;">${data.resetUrl}</span>
        </p>
        
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Need help? Contact us anytime! 🏈<br>
          <em>The Pigskin Pick Six Team</em>
        </p>
      </div>
    </div>
  `.trim()
}

export function getPasswordResetText(data: PasswordResetData): string {
  return `
🔐 Reset Your Password - Pigskin Pick Six

Hi ${data.userDisplayName}!

We received a request to reset the password for your Pigskin Pick Six account. 
Click the link below to create a new password:

${data.resetUrl}

🔒 This is a secure password reset link.

⚠️ SECURITY NOTE:
This reset link will expire in 1 hour for your security. If you didn't request a password reset, you can safely ignore this email - your account remains secure.

Need help? Contact us anytime! 🏈
The Pigskin Pick Six Team
  `.trim()
}