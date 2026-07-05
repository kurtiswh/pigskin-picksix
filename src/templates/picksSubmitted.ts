import type { PicksSubmittedData } from './types'
import { emailShell, emailButton, emailPanel, p, EMAIL } from './emailShell'

export function getPicksSubmittedSubject(data: PicksSubmittedData): string {
  return `✅ Week ${data.week} Picks Confirmed - ${data.picks.length} Games Selected`
}

export function getPicksSubmittedHtml(data: PicksSubmittedData): string {
  const picksHtml = data.picks.map(pick => {
    const gameMatch = pick.game.match(/^(.+?)\s+@\s+(.+)$/)
    const awayTeam = gameMatch?.[1]?.trim()
    let displaySpread = pick.spread || 0
    if (pick.pick === awayTeam) displaySpread = -displaySpread
    const spreadText = displaySpread > 0 ? `+${displaySpread}` : displaySpread.toString()
    const w = pick.isLock ? 'bold' : 'normal'
    return `<tr style="border-bottom:1px solid ${EMAIL.line}">
      <td style="padding:10px 8px;color:${EMAIL.ink};font-weight:${w}">${pick.isLock ? '🔒 ' : ''}${pick.game}</td>
      <td style="padding:10px 8px;color:${EMAIL.ink};text-align:center;font-weight:${w}">${pick.pick} (${spreadText})</td>
    </tr>`
  }).join('')

  const table = `<table style="width:100%;border-collapse:collapse;background:#fbfaf7;border:1px solid ${EMAIL.line};border-radius:8px;overflow:hidden;margin:6px 0 4px">
    <thead><tr style="background:#f3efe7">
      <th style="padding:10px 8px;color:${EMAIL.brown};text-align:left;font-size:12px;text-transform:uppercase;letter-spacing:.04em">Game</th>
      <th style="padding:10px 8px;color:${EMAIL.brown};text-align:center;font-size:12px;text-transform:uppercase;letter-spacing:.04em">Pick</th>
    </tr></thead><tbody>${picksHtml}</tbody></table>`

  return emailShell({
    subtitle: 'Picks Confirmed',
    heading: `Hi ${data.userDisplayName}!`,
    preheader: `Your Week ${data.week} picks are in — ${data.picks.length} games, ${data.picks.filter(p => p.isLock).length} lock`,
    bodyHtml:
      p(`Your picks for <strong>Week ${data.week}</strong> of the ${data.season} season are confirmed! ✅`) +
      emailPanel(`<strong>📅 Submitted:</strong> ${data.submittedStr}<br>🎯 ${data.picks.length} games · ${data.picks.filter(p => p.isLock).length} Lock pick`, 'green') +
      `<h3 style="color:${EMAIL.brown};margin:20px 0 10px;font-size:16px">Your picks</h3>` + table +
      emailPanel(`<strong>🔒 Lock pick:</strong> the game marked with 🔒 earns double the margin bonus if it hits.`, 'gold') +
      emailButton('View Leaderboard', `${data.baseUrl}/leaderboard`),
  })
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