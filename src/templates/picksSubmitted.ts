import type { PicksSubmittedData } from './types'

export function getPicksSubmittedSubject(data: PicksSubmittedData): string {
  return `✅ Week ${data.week} Picks Confirmed - ${data.picks.length} Games Selected`
}

export function getPicksSubmittedHtml(data: PicksSubmittedData): string {
  console.log('🔧 EMAIL TEMPLATE DEBUG - Raw picks data:', JSON.stringify(data.picks, null, 2))
  
  const picksHtml = data.picks.map(pick => {
    console.log('🔧 EMAIL TEMPLATE DEBUG - Processing pick:', pick)
    
    // Parse game string to determine home/away teams
    const gameMatch = pick.game.match(/^(.+?)\s+@\s+(.+)$/)
    const awayTeam = gameMatch?.[1]?.trim()
    const homeTeam = gameMatch?.[2]?.trim()
    
    console.log('🔧 EMAIL TEMPLATE DEBUG - Parsed teams:', { awayTeam, homeTeam, pick: pick.pick, spread: pick.spread })
    
    // Determine the spread for the picked team
    // Spread is always relative to the home team
    // If pick is home team: use spread as-is
    // If pick is away team: flip the spread sign
    let displaySpread = pick.spread || 0
    if (pick.pick === awayTeam) {
      displaySpread = -displaySpread
    }
    
    console.log('🔧 EMAIL TEMPLATE DEBUG - Final display spread:', displaySpread)
    
    // Format spread display
    const spreadText = displaySpread > 0 ? `+${displaySpread}` : displaySpread.toString()
    
    return `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 8px; color: #1f2937; font-weight: ${pick.isLock ? 'bold' : 'normal'};">
        ${pick.isLock ? '🔒 ' : ''}${pick.game}
      </td>
      <td style="padding: 12px 8px; color: #1f2937; text-align: center; font-weight: ${pick.isLock ? 'bold' : 'normal'};">
        ${pick.pick} (${spreadText})
      </td>
    </tr>
    `
  }).join('')

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">✅ Picks Confirmed!</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick Six</p>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Hi ${data.userDisplayName}!</h2>
        
        <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
          Your picks for <strong>Week ${data.week}</strong> of the ${data.season} season have been confirmed!
        </p>
        
        <div style="background-color: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="color: #15803d; margin: 0 0 10px 0; font-weight: bold;">
            📅 Submitted: ${data.submittedStr}
          </p>
          <p style="color: #15803d; margin: 0; font-size: 14px;">
            🎯 ${data.picks.length} games selected • ${data.picks.filter(p => p.isLock).length} Lock pick
          </p>
        </div>
        
        <h3 style="color: #1f2937; margin: 25px 0 15px 0;">Your Picks:</h3>
        <table style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 12px 8px; color: #374151; font-weight: bold; text-align: left;">Game</th>
              <th style="padding: 12px 8px; color: #374151; font-weight: bold; text-align: center;">Pick</th>
            </tr>
          </thead>
          <tbody>
            ${picksHtml}
          </tbody>
        </table>
        
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
          <p style="color: #92400e; margin: 0; font-size: 14px; text-align: center;">
            <strong>🔒 Lock Pick:</strong> Your Lock pick (marked with 🔒) earns double the margin bonus if correct!
          </p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.baseUrl}/leaderboard" 
             style="background-color: #8B4513; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            View Leaderboard
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Good luck this week! 🍀<br>
          <em>The Pigskin Pick Six Team</em>
        </p>
      </div>
    </div>
  `.trim()
}

export function getPicksSubmittedText(data: PicksSubmittedData): string {
  const picksText = data.picks.map(pick => {
    // Parse game string to determine home/away teams
    const gameMatch = pick.game.match(/^(.+?)\s+@\s+(.+)$/)
    const awayTeam = gameMatch?.[1]?.trim()
    const homeTeam = gameMatch?.[2]?.trim()
    
    // Determine the spread for the picked team
    // Spread is always relative to the home team
    // If pick is home team: use spread as-is
    // If pick is away team: flip the spread sign
    let displaySpread = pick.spread
    if (pick.pick === awayTeam) {
      displaySpread = -pick.spread
    }
    
    // Format spread display
    const spreadText = displaySpread > 0 ? `+${displaySpread}` : displaySpread.toString()
    return `${pick.isLock ? '🔒 ' : '   '}${pick.game} → ${pick.pick} (${spreadText})`
  }).join('\n')

  return `
✅ Picks Confirmed! - Pigskin Pick Six

Hi ${data.userDisplayName}!

Your picks for Week ${data.week} of the ${data.season} season have been confirmed!

📅 Submitted: ${data.submittedStr}
🎯 ${data.picks.length} games selected • ${data.picks.filter(p => p.isLock).length} Lock pick

YOUR PICKS:
${picksText}

🔒 Lock Pick: Your Lock pick (marked with 🔒) earns double the margin bonus if correct!

View the leaderboard: ${data.baseUrl}/leaderboard

Good luck this week! 🍀
The Pigskin Pick Six Team
  `.trim()
}