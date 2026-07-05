import type { PasswordResetData } from './types'
import { emailShell, emailButton, emailPanel, p, EMAIL } from './emailShell'

export function getPasswordResetSubject(data: PasswordResetData): string {
  return `🔐 Reset Your Pigskin Pick Six Password`
}

export function getPasswordResetHtml(data: PasswordResetData): string {
  return emailShell({
    subtitle: 'Password Reset',
    heading: `Hi ${data.userDisplayName}!`,
    preheader: 'Reset your Pigskin Pick Six password',
    bodyHtml:
      p('We received a request to reset the password for your Pigskin Pick Six account. Click below to create a new one.') +
      emailButton('Reset Password', data.resetUrl) +
      emailPanel(`<strong>⚠️ Security note:</strong> this link expires in 1 hour. If you didn't request a reset, you can safely ignore this email — your account stays secure.`, 'gold') +
      `<p style="color:${EMAIL.muted};font-size:13px;line-height:1.5">Trouble with the button? Paste this into your browser:<br><span style="word-break:break-all">${data.resetUrl}</span></p>`,
  })
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