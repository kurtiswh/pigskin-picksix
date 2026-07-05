import type { WeekOpenedData } from './types'
import { emailShell, emailButton, emailPanel, p, bullets } from './emailShell'

export function getWeekOpenedSubject(data: WeekOpenedData): string {
  return `🏈 Week ${data.week} is OPEN! ${data.totalGames} Games Available`
}

export function getWeekOpenedHtml(data: WeekOpenedData): string {
  return emailShell({
    subtitle: `Week ${data.week} is Open`,
    heading: 'Ready to make your picks?',
    preheader: `Week ${data.week} is open — ${data.totalGames} games, due ${data.deadlineStr}`,
    bodyHtml:
      p(`Week ${data.week} of the ${data.season} college football season is now open! Choose your 6 games against the spread and set your Lock pick for bonus points.`) +
      emailPanel(`<div style="text-align:center"><div style="font-size:15px;font-weight:700">📊 This week's slate</div><div style="font-size:24px;font-weight:800;margin:6px 0">${data.totalGames} games available</div>🔒 Don't forget your Lock for a double margin bonus!</div>`, 'info') +
      emailPanel(`<strong>⏰ All picks due:</strong><br>${data.deadlineStr}`, 'gold') +
      `<h3 style="color:${'#4B3621'};margin:20px 0 8px;font-size:16px">🎯 How to play</h3>` +
      bullets([
        'Select exactly 6 games against the spread',
        'Choose 1 game as your Lock (doubles the margin bonus)',
        'Submit before the deadline',
        'Earn 20 for a win, 10 for a push, 0 for a loss',
      ]) +
      emailButton('Make Your Picks Now', `${data.baseUrl}/picks`),
  })
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