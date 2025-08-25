import type { PickReminderData } from './types'

export function getPickReminderSubject(data: PickReminderData): string {
  return `🏈 Week ${data.week} Pick Reminder - Deadline ${data.deadline.toLocaleDateString()}`
}

export function getPickReminderHtml(data: PickReminderData): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #8B4513; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">🏈 Pigskin Pick Six</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px;">Pick Reminder</p>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Hi ${data.userDisplayName}!</h2>
        
        <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
          Don't forget to submit your picks for <strong>Week ${data.week}</strong> of the ${data.season} season!
        </p>
        
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #92400e; margin-top: 0; font-size: 18px;">⏰ Deadline Approaching</h3>
          <p style="color: #92400e; margin: 0; font-size: 16px;">
            <strong>Picks must be submitted by:</strong><br>
            ${data.deadlineStr}
          </p>
        </div>
        
        <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
          Remember to:
        </p>
        <ul style="color: #4b5563; font-size: 16px; line-height: 1.5;">
          <li>Select exactly 6 games</li>
          <li>Choose 1 game as your Lock (doubles margin bonus)</li>
          <li>Submit your picks before the deadline</li>
        </ul>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.baseUrl}/picks" 
             style="background-color: #8B4513; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Make Your Picks Now
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Good luck! 🍀<br>
          <em>The Pigskin Pick Six Team</em>
        </p>
      </div>
    </div>
  `.trim()
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