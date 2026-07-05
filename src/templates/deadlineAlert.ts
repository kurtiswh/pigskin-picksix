import type { DeadlineAlertData } from './types'
import { emailShell, emailButton, emailPanel, p } from './emailShell'

export function getDeadlineAlertSubject(data: DeadlineAlertData): string {
  const urgencyText = data.hoursLeft <= 2 ? '🚨 URGENT' : '⏰ REMINDER'
  return `${urgencyText}: Week ${data.week} Deadline in ${data.hoursLeft} hour${data.hoursLeft !== 1 ? 's' : ''}!`
}

export function getDeadlineAlertHtml(data: DeadlineAlertData): string {
  const urgent = data.hoursLeft <= 2
  return emailShell({
    subtitle: urgent ? 'Urgent · Deadline Alert' : 'Deadline Alert',
    heading: `Hi ${data.userDisplayName}!`,
    preheader: `Only ${data.hoursLeft} hour${data.hoursLeft !== 1 ? 's' : ''} left to submit Week ${data.week} picks`,
    bodyHtml:
      emailPanel(
        `<div style="text-align:center"><div style="font-size:20px;font-weight:800">⏰ Only ${data.hoursLeft} hour${data.hoursLeft !== 1 ? 's' : ''} left!</div>` +
        `<div style="margin-top:8px"><strong>Week ${data.week} picks due:</strong><br>${data.deadlineStr}</div></div>`,
        urgent ? 'red' : 'gold'
      ) +
      p(urgent
        ? `This is your final reminder! Don't miss out on Week ${data.week}.`
        : `Time is running out to submit your picks for Week ${data.week}.`) +
      emailButton('Submit Picks Now', `${data.baseUrl}/picks`),
  })
}

export function getDeadlineAlertText(data: DeadlineAlertData): string {
  const urgencyText = data.hoursLeft <= 2 ? '🚨 URGENT' : '⏰ REMINDER'
  
  return `
${urgencyText}: Deadline Alert - Pigskin Pick Six

Hi ${data.userDisplayName}!

⏰ Only ${data.hoursLeft} hour${data.hoursLeft !== 1 ? 's' : ''} left to submit your Week ${data.week} picks!

DEADLINE: ${data.deadlineStr}

${data.hoursLeft <= 2 
  ? `This is your final reminder! Don't miss out on Week ${data.week}.` 
  : `Time is running out to submit your picks for Week ${data.week}.`}

Submit your picks now: ${data.baseUrl}/picks

Don't let the clock run out! ⏰
The Pigskin Pick Six Team
  `.trim()
}