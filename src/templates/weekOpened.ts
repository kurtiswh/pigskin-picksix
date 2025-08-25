import type { WeekOpenedData } from './types'

export function getWeekOpenedSubject(data: WeekOpenedData): string {
  return `🏈 Week ${data.week} is OPEN! ${data.totalGames} Games Available`
}

export function getWeekOpenedHtml(data: WeekOpenedData): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #059669; color: white; padding: 25px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 28px;">🏈 Week ${data.week} is OPEN!</h1>
        <p style="margin: 15px 0 0 0; font-size: 18px; font-weight: bold;">Pigskin Pick Six Pro</p>
      </div>
      
      <div style="background-color: white; padding: 35px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0; font-size: 22px;">Ready to make your picks?</h2>
        
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          Week ${data.week} of the ${data.season} college football season is now open for picks! 
          Choose your 6 games against the spread and select your Lock pick for bonus points.
        </p>
        
        <div style="background-color: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 10px; padding: 25px; margin: 25px 0; text-align: center;">
          <h3 style="color: #0369a1; margin-top: 0; font-size: 20px;">📊 This Week's Slate</h3>
          <p style="color: #0369a1; margin: 10px 0; font-size: 24px; font-weight: bold;">
            ${data.totalGames} Games Available
          </p>
          <p style="color: #0369a1; margin: 10px 0 0 0; font-size: 16px;">
            🔒 Don't forget your Lock pick for double margin bonus!
          </p>
        </div>
        
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h4 style="color: #92400e; margin-top: 0; font-size: 16px;">⏰ Important Deadline</h4>
          <p style="color: #92400e; margin: 0; font-size: 16px;">
            <strong>All picks must be submitted by:</strong><br>
            ${data.deadlineStr}
          </p>
        </div>
        
        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <h4 style="color: #1f2937; margin-top: 0;">🎯 How to Play:</h4>
          <ul style="color: #4b5563; margin: 10px 0; padding-left: 20px; line-height: 1.5;">
            <li>Select exactly 6 games against the spread</li>
            <li>Choose 1 game as your Lock (doubles margin bonus)</li>
            <li>Submit before the deadline</li>
            <li>Earn 20 points for wins, 10 for pushes, 0 for losses</li>
          </ul>
        </div>
        
        <div style="text-align: center; margin: 35px 0;">
          <a href="${data.baseUrl}/picks" 
             style="background-color: #059669; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px;">
            Make Your Picks Now
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Let's have a great week! 🏈<br>
          <em>The Pigskin Pick Six Team</em>
        </p>
      </div>
    </div>
  `.trim()
}

export function getWeekOpenedText(data: WeekOpenedData): string {
  return `
🏈 Week ${data.week} is OPEN! - Pigskin Pick Six Pro

Ready to make your picks?

Week ${data.week} of the ${data.season} college football season is now open for picks! 
Choose your 6 games against the spread and select your Lock pick for bonus points.

📊 THIS WEEK'S SLATE
${data.totalGames} Games Available
🔒 Don't forget your Lock pick for double margin bonus!

⏰ IMPORTANT DEADLINE
All picks must be submitted by: ${data.deadlineStr}

🎯 HOW TO PLAY:
• Select exactly 6 games against the spread
• Choose 1 game as your Lock (doubles margin bonus)
• Submit before the deadline
• Earn 20 points for wins, 10 for pushes, 0 for losses

Make your picks now: ${data.baseUrl}/picks

Let's have a great week! 🏈
The Pigskin Pick Six Team
  `.trim()
}