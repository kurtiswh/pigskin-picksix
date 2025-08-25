import type { WeeklyResultsData } from './types'

export function getWeeklyResultsSubject(data: WeeklyResultsData): string {
  return `📊 Week ${data.week} Results: ${data.userStats.weeklyPoints} Points Earned`
}

export function getWeeklyResultsHtml(data: WeeklyResultsData): string {
  const { weeklyPoints, weeklyRank, totalPlayers, seasonPoints, seasonRank, picks } = data.userStats
  const record = picks.reduce((acc, pick) => {
    if (pick.result === 'win') acc.wins++
    else if (pick.result === 'loss') acc.losses++
    else acc.pushes++
    return acc
  }, { wins: 0, losses: 0, pushes: 0 })

  const picksHtml = picks.map(pick => {
    const resultColor = pick.result === 'win' ? '#059669' : pick.result === 'loss' ? '#dc2626' : '#f59e0b'
    const resultIcon = pick.result === 'win' ? '✅' : pick.result === 'loss' ? '❌' : '⏸️'
    
    return `
      <tr style="border-bottom: 1px solid #e5e7eb;">
        <td style="padding: 12px 8px; color: #1f2937; font-weight: ${pick.isLock ? 'bold' : 'normal'};">
          ${pick.isLock ? '🔒 ' : ''}${pick.game}
        </td>
        <td style="padding: 12px 8px; color: #1f2937; text-align: center;">
          ${pick.pick}
        </td>
        <td style="padding: 12px 8px; color: ${resultColor}; text-align: center; font-weight: bold;">
          ${resultIcon} ${pick.result.toUpperCase()}
        </td>
        <td style="padding: 12px 8px; color: ${resultColor}; text-align: center; font-weight: bold;">
          +${pick.points}
        </td>
      </tr>
    `
  }).join('')

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
      <div style="background-color: #8B4513; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 24px;">📊 Week ${data.week} Results</h1>
        <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick Six</p>
      </div>
      
      <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <h2 style="color: #1f2937; margin-top: 0;">Hi ${data.userDisplayName}!</h2>
        
        <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
          Here are your results for Week ${data.week} of the ${data.season} season:
        </p>
        
        <div style="background-color: #f3f4f6; border-radius: 8px; padding: 25px; margin: 25px 0;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: center; margin-bottom: 20px;">
            <div>
              <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 18px;">Weekly Points</h3>
              <p style="color: #059669; margin: 0; font-size: 32px; font-weight: bold;">${weeklyPoints}</p>
            </div>
            <div>
              <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 18px;">Weekly Rank</h3>
              <p style="color: #1f2937; margin: 0; font-size: 24px; font-weight: bold;">#${weeklyRank} of ${totalPlayers}</p>
            </div>
          </div>
          <div style="text-align: center; padding-top: 20px; border-top: 1px solid #d1d5db;">
            <p style="color: #4b5563; margin: 0; font-size: 16px;">
              Record: ${record.wins}-${record.losses}${record.pushes > 0 ? `-${record.pushes}` : ''} • 
              Season Points: ${seasonPoints} (#${seasonRank})
            </p>
          </div>
        </div>
        
        <h3 style="color: #1f2937; margin: 25px 0 15px 0;">Your Week ${data.week} Results:</h3>
        <table style="width: 100%; border-collapse: collapse; background-color: #f9fafb; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background-color: #f3f4f6;">
              <th style="padding: 12px 8px; color: #374151; font-weight: bold; text-align: left;">Game</th>
              <th style="padding: 12px 8px; color: #374151; font-weight: bold; text-align: center;">Pick</th>
              <th style="padding: 12px 8px; color: #374151; font-weight: bold; text-align: center;">Result</th>
              <th style="padding: 12px 8px; color: #374151; font-weight: bold; text-align: center;">Points</th>
            </tr>
          </thead>
          <tbody>
            ${picksHtml}
          </tbody>
        </table>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${data.baseUrl}/leaderboard" 
             style="background-color: #8B4513; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-right: 10px;">
            View Full Leaderboard
          </a>
          <a href="${data.baseUrl}/picks" 
             style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Next Week's Picks
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          Great week! Keep it up! 🏈<br>
          <em>The Pigskin Pick Six Team</em>
        </p>
      </div>
    </div>
  `.trim()
}

export function getWeeklyResultsText(data: WeeklyResultsData): string {
  const { weeklyPoints, weeklyRank, totalPlayers, seasonPoints, seasonRank, picks } = data.userStats
  const record = picks.reduce((acc, pick) => {
    if (pick.result === 'win') acc.wins++
    else if (pick.result === 'loss') acc.losses++
    else acc.pushes++
    return acc
  }, { wins: 0, losses: 0, pushes: 0 })

  const picksText = picks.map(pick => {
    const resultIcon = pick.result === 'win' ? '✅' : pick.result === 'loss' ? '❌' : '⏸️'
    return `${pick.isLock ? '🔒 ' : '   '}${pick.game} → ${pick.pick} ${resultIcon} +${pick.points} pts`
  }).join('\n')

  return `
📊 Week ${data.week} Results - Pigskin Pick Six

Hi ${data.userDisplayName}!

Here are your results for Week ${data.week} of the ${data.season} season:

🏆 WEEKLY PERFORMANCE
Points Earned: ${weeklyPoints}
Weekly Rank: #${weeklyRank} of ${totalPlayers}
Record: ${record.wins}-${record.losses}${record.pushes > 0 ? `-${record.pushes}` : ''}

📈 SEASON TOTALS  
Season Points: ${seasonPoints}
Season Rank: #${seasonRank}

YOUR WEEK ${data.week} RESULTS:
${picksText}

View full leaderboard: ${data.baseUrl}/leaderboard
Next week's picks: ${data.baseUrl}/picks

Great week! Keep it up! 🏈
The Pigskin Pick Six Team
  `.trim()
}