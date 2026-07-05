import type { PickReminderData } from './types'
import { emailShell, emailButton, emailPanel, p, bullets } from './emailShell'

export function getPickReminderSubject(data: PickReminderData): string {
  return `🏈 Week ${data.week} Pick Reminder - Deadline ${data.deadline.toLocaleDateString()}`
}

export function getPickReminderHtml(data: PickReminderData): string {
  return emailShell({
    subtitle: 'Pick Reminder',
    heading: `Hi ${data.userDisplayName}!`,
    preheader: `Week ${data.week} picks are due ${data.deadlineStr}`,
    bodyHtml:
      p(`Don't forget to submit your picks for <strong>Week ${data.week}</strong> of the ${data.season} season!`) +
      emailPanel(`<strong>⏰ Deadline approaching — picks must be submitted by:</strong><br>${data.deadlineStr}`, 'gold') +
      p('Remember to:') +
      bullets(['Select exactly 6 games', 'Choose 1 game as your Lock (doubles the margin bonus)', 'Submit before the deadline']) +
      emailButton('Make Your Picks Now', `${data.baseUrl}/picks`),
  })
}

export function getPickReminderText(data: PickReminderData): string {
  return `
🏈 Pigskin Pick Six - Pick Reminder

Hi ${data.userDisplayName}!

Don't forget to submit your picks for Week ${data.week} of the ${data.season} season!

⏰ DEADLINE: ${data.deadlineStr}

Remember to:
• Select exactly 6 games
• Choose 1 game as your Lock (doubles margin bonus)  
• Submit your picks before the deadline

Make your picks now: ${data.baseUrl}/picks

Good luck! 🍀
The Pigskin Pick Six Team
  `.trim()
}