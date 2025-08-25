import type { DeadlineAlertData } from './types'

export function getDeadlineAlertSubject(data: DeadlineAlertData): string {
  const urgencyText = data.hoursLeft <= 2 ? '🚨 URGENT' : '⏰ REMINDER'
  return `${urgencyText}: Week ${data.week} Deadline in ${data.hoursLeft} hour${data.hoursLeft !== 1 ? 's' : ''}!`
}

export function getDeadlineAlertHtml(data: DeadlineAlertData): string {
  const urgencyColor = data.hoursLeft <= 2 ? '#dc2626' : '#f59e0b'
  const urgencyText = data.hoursLeft <= 2 ? 'URGENT' : 'REMINDER'

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: ${urgencyColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">🚨 ${urgencyText}: Deadline Alert</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick Six</p>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Hi ${data.userDisplayName}!</h2>
        
        <div style="background-color: #fee2e2; border: 2px solid ${urgencyColor}; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <h3 style="color: ${urgencyColor}; margin-top: 0; font-size: 20px;">
            ⏰ Only ${data.hoursLeft} hour${data.hoursLeft !== 1 ? 's' : ''} left!
          </h3>
          <p style="color: #1f2937; margin: 10px 0; font-size: 18px;">
            <strong>Week ${data.week} picks due:</strong><br>
            ${data.deadlineStr}
          </p>
        </div>
        
        <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
          ${data.hoursLeft <= 2 
            ? `This is your final reminder! Don't miss out on Week ${data.week}.` 
            : `Time is running out to submit your picks for Week ${data.week}.`}
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.baseUrl}/picks" 
             style="background-color: ${urgencyColor}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 18px;">
            Submit Picks Now!
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Don't let the clock run out! ⏰<br>
          <em>The Pigskin Pick Six Team</em>
        </p>
      </div>
    </div>
  `.trim()
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