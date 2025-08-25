import type { MagicLinkData } from './types'

export function getMagicLinkSubject(data: MagicLinkData): string {
  return `🔗 Your Pigskin Pick Six Sign-In Link`
}

export function getMagicLinkHtml(data: MagicLinkData): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #8B4513; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">🔗 Sign-In Link</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick Six</p>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Hi ${data.userDisplayName}!</h2>
        
        <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
          Click the button below to securely sign in to your Pigskin Pick Six account.
        </p>
        
        <div style="background-color: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 8px; padding: 20px; margin: 25px 0; text-align: center;">
          <p style="color: #0369a1; margin: 0 0 15px 0; font-size: 16px;">
            🔐 Secure one-click sign-in
          </p>
          <a href="${data.magicLinkUrl}" 
             style="background-color: #0ea5e9; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
            Sign In to Pigskin Pick Six
          </a>
        </div>
        
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h4 style="color: #92400e; margin-top: 0; font-size: 14px;">⚠️ Security Note</h4>
          <p style="color: #92400e; margin: 0; font-size: 14px;">
            This link will expire in 1 hour for your security. If you didn't request this sign-in link, you can safely ignore this email.
          </p>
        </div>
        
        <p style="color: #4b5563; font-size: 14px; line-height: 1.5;">
          Having trouble with the button? Copy and paste this link into your browser:<br>
          <span style="color: #6b7280; word-break: break-all;">${data.magicLinkUrl}</span>
        </p>
        
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Welcome back! 🏈<br>
          <em>The Pigskin Pick Six Team</em>
        </p>
      </div>
    </div>
  `.trim()
}

export function getMagicLinkText(data: MagicLinkData): string {
  return `
🔗 Sign-In Link - Pigskin Pick Six

Hi ${data.userDisplayName}!

Click the link below to securely sign in to your Pigskin Pick Six account:

${data.magicLinkUrl}

🔐 This is a secure one-click sign-in link.

⚠️ SECURITY NOTE:
This link will expire in 1 hour for your security. If you didn't request this sign-in link, you can safely ignore this email.

Welcome back! 🏈
The Pigskin Pick Six Team
  `.trim()
}