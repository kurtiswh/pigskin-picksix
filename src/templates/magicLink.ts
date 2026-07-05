import type { MagicLinkData } from './types'
import { emailShell, emailButton, emailPanel, p, EMAIL } from './emailShell'

export function getMagicLinkSubject(data: MagicLinkData): string {
  return `🔗 Your Pigskin Pick Six Sign-In Link`
}

export function getMagicLinkHtml(data: MagicLinkData): string {
  return emailShell({
    subtitle: 'Sign-In Link',
    heading: `Hi ${data.userDisplayName}!`,
    preheader: 'Your secure one-click sign-in link',
    bodyHtml:
      p('Click the button below to securely sign in to your Pigskin Pick Six account.') +
      emailButton('Sign In to Pigskin Pick Six', data.magicLinkUrl) +
      emailPanel(`<strong>⚠️ Security note:</strong> this link expires in 1 hour. If you didn't request it, you can safely ignore this email.`, 'gold') +
      `<p style="color:${EMAIL.muted};font-size:13px;line-height:1.5">Trouble with the button? Paste this into your browser:<br><span style="word-break:break-all">${data.magicLinkUrl}</span></p>`,
  })
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