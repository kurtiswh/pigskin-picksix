/**
 * Email Service
 * Handles email notifications for pick reminders, results, and alerts
 */

import { supabase } from '@/lib/supabase'
import { UserPreferences } from '@/types'
import { Resend } from 'resend'

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

export interface EmailJob {
  id: string
  user_id: string
  email: string
  template_type: 'pick_reminder' | 'deadline_alert' | 'weekly_results' | 'game_completed' | 'picks_submitted' | 'week_opened'
  subject: string
  html_content: string
  text_content: string
  scheduled_for: string
  status: 'pending' | 'sent' | 'failed'
  attempts: number
  error_message?: string
  created_at: string
  sent_at?: string
}

/**
 * Email template generators
 */
export class EmailTemplates {
  static pickReminder(userDisplayName: string, week: number, season: number, deadline: Date): EmailTemplate {
    const deadlineStr = deadline.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #8B4513; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🏈 Pigskin Pick 6 Pro</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Pick Reminder</p>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Hi ${userDisplayName}!</h2>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
            Don't forget to submit your picks for <strong>Week ${week}</strong> of the ${season} season!
          </p>
          
          <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #92400e; margin-top: 0; font-size: 18px;">⏰ Deadline Approaching</h3>
            <p style="color: #92400e; margin: 0; font-size: 16px;">
              <strong>Picks must be submitted by:</strong><br>
              ${deadlineStr}
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
            <a href="${window.location.origin}/picks" 
               style="background-color: #8B4513; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Make Your Picks Now
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            Good luck! 🍀<br>
            <em>The Pigskin Pick 6 Pro Team</em>
          </p>
        </div>
      </div>
    `

    const text = `
🏈 Pigskin Pick 6 Pro - Pick Reminder

Hi ${userDisplayName}!

Don't forget to submit your picks for Week ${week} of the ${season} season!

⏰ DEADLINE: ${deadlineStr}

Remember to:
• Select exactly 6 games
• Choose 1 game as your Lock (doubles margin bonus)  
• Submit your picks before the deadline

Make your picks now: ${window.location.origin}/picks

Good luck! 🍀
The Pigskin Pick 6 Pro Team
    `.trim()

    return {
      subject: `🏈 Week ${week} Pick Reminder - Deadline ${deadline.toLocaleDateString()}`,
      html,
      text
    }
  }

  static deadlineAlert(userDisplayName: string, week: number, season: number, deadline: Date, hoursLeft: number): EmailTemplate {
    const deadlineStr = deadline.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })

    const urgencyColor = hoursLeft <= 2 ? '#dc2626' : '#f59e0b'
    const urgencyText = hoursLeft <= 2 ? 'URGENT' : 'REMINDER'

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: ${urgencyColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🚨 ${urgencyText}: Deadline Alert</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick 6 Pro</p>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Hi ${userDisplayName}!</h2>
          
          <div style="background-color: #fee2e2; border: 2px solid ${urgencyColor}; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <h3 style="color: ${urgencyColor}; margin-top: 0; font-size: 20px;">
              ⏰ Only ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} left!
            </h3>
            <p style="color: #1f2937; margin: 10px 0; font-size: 18px;">
              <strong>Week ${week} picks due:</strong><br>
              ${deadlineStr}
            </p>
          </div>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
            ${hoursLeft <= 2 
              ? 'This is your final reminder! Don\'t miss out on Week ' + week + '.' 
              : 'Time is running out to submit your picks for Week ' + week + '.'}
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/picks" 
               style="background-color: ${urgencyColor}; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 18px;">
              Submit Picks Now!
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            Don't let the clock run out! ⏰<br>
            <em>The Pigskin Pick 6 Pro Team</em>
          </p>
        </div>
      </div>
    `

    const text = `
🚨 ${urgencyText}: DEADLINE ALERT

Hi ${userDisplayName}!

⏰ Only ${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} left to submit Week ${week} picks!

DEADLINE: ${deadlineStr}

${hoursLeft <= 2 
  ? 'This is your final reminder! Don\'t miss out on Week ' + week + '.' 
  : 'Time is running out to submit your picks for Week ' + week + '.'}

Submit picks now: ${window.location.origin}/picks

Don't let the clock run out! ⏰
The Pigskin Pick 6 Pro Team
    `.trim()

    return {
      subject: `🚨 ${urgencyText}: Week ${week} Picks Due in ${hoursLeft}h!`,
      html,
      text
    }
  }

  static weeklyResults(
    userDisplayName: string, 
    week: number, 
    season: number, 
    userStats: {
      points: number
      record: string
      rank: number
      totalPlayers: number
      picks: Array<{
        game: string
        pick: string
        result: 'win' | 'loss' | 'push'
        points: number
        isLock: boolean
      }>
    }
  ): EmailTemplate {
    const { points, record, rank, totalPlayers, picks } = userStats
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #8B4513; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🏈 Week ${week} Results</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick 6 Pro</p>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Hi ${userDisplayName}!</h2>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
            Here are your results for Week ${week} of the ${season} season:
          </p>
          
          <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; text-align: center;">
              <div>
                <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 18px;">Points Earned</h3>
                <p style="color: #059669; margin: 0; font-size: 24px; font-weight: bold;">${points}</p>
              </div>
              <div>
                <h3 style="color: #1f2937; margin: 0 0 10px 0; font-size: 18px;">Weekly Rank</h3>
                <p style="color: #1f2937; margin: 0; font-size: 24px; font-weight: bold;">#${rank} of ${totalPlayers}</p>
              </div>
            </div>
            <div style="text-align: center; margin-top: 15px;">
              <p style="color: #4b5563; margin: 0; font-size: 16px;">Record: ${record}</p>
            </div>
          </div>
          
          <h3 style="color: #1f2937; margin: 20px 0 15px 0;">Your Picks Breakdown:</h3>
          
          <div style="space-y: 10px;">
            ${picks.map(pick => `
              <div style="border: 1px solid #d1d5db; border-radius: 6px; padding: 15px; margin: 10px 0; 
                          background-color: ${pick.result === 'win' ? '#f0f9f4' : pick.result === 'loss' ? '#fef2f2' : '#fffbeb'};">
                <div style="display: flex; justify-content: between; align-items: center;">
                  <div style="flex: 1;">
                    <strong style="color: #1f2937;">${pick.game}</strong>
                    <br>
                    <span style="color: #6b7280; font-size: 14px;">Pick: ${pick.pick}</span>
                    ${pick.isLock ? '<span style="color: #f59e0b; font-size: 12px; margin-left: 8px;">🔒 LOCK</span>' : ''}
                  </div>
                  <div style="text-align: right;">
                    <span style="color: ${pick.result === 'win' ? '#059669' : pick.result === 'loss' ? '#dc2626' : '#f59e0b'}; 
                                 font-weight: bold; font-size: 16px;">
                      ${pick.result === 'win' ? '✓' : pick.result === 'loss' ? '✗' : '≈'} ${pick.points} pts
                    </span>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${window.location.origin}/leaderboard" 
               style="background-color: #8B4513; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-right: 10px;">
              View Full Leaderboard
            </a>
            <a href="${window.location.origin}/picks" 
               style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Next Week's Picks
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            Great job this week! 🎉<br>
            <em>The Pigskin Pick 6 Pro Team</em>
          </p>
        </div>
      </div>
    `

    const text = `
🏈 Week ${week} Results - Pigskin Pick 6 Pro

Hi ${userDisplayName}!

Here are your results for Week ${week} of the ${season} season:

📊 WEEK ${week} SUMMARY
Points Earned: ${points}
Weekly Rank: #${rank} of ${totalPlayers}
Record: ${record}

🏈 YOUR PICKS:
${picks.map(pick => 
  `${pick.game}
   Pick: ${pick.pick}${pick.isLock ? ' 🔒 LOCK' : ''}
   Result: ${pick.result === 'win' ? '✓ WIN' : pick.result === 'loss' ? '✗ LOSS' : '≈ PUSH'} - ${pick.points} pts`
).join('\n\n')}

View full leaderboard: ${window.location.origin}/leaderboard
Make next week's picks: ${window.location.origin}/picks

Great job this week! 🎉
The Pigskin Pick 6 Pro Team
    `.trim()

    return {
      subject: `🏈 Week ${week} Results: ${points} Points (#${rank} of ${totalPlayers})`,
      html,
      text
    }
  }

  static picksSubmitted(
    userDisplayName: string, 
    week: number, 
    season: number,
    picks: Array<{
      game: string
      pick: string
      isLock: boolean
      lockTime: string
    }>,
    submittedAt: Date
  ): EmailTemplate {
    const submittedStr = submittedAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #059669; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">✅ Picks Confirmed!</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick 6 Pro</p>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Hi ${userDisplayName}!</h2>
          
          <div style="background-color: #d1fae5; border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <h3 style="color: #065f46; margin-top: 0; font-size: 20px;">
              🎉 Your Week ${week} picks are confirmed!
            </h3>
            <p style="color: #047857; margin: 10px 0; font-size: 16px;">
              Submitted on ${submittedStr}
            </p>
          </div>
          
          <h3 style="color: #1f2937; margin: 20px 0 15px 0;">Your Submitted Picks:</h3>
          
          <div style="space-y: 10px;">
            ${picks.map((pick, index) => `
              <div style="border: 1px solid #d1d5db; border-radius: 6px; padding: 15px; margin: 10px 0; background-color: #f9fafb;">
                <div style="display: flex; justify-content: between; align-items: center;">
                  <div style="flex: 1;">
                    <div style="display: flex; align-items: center; margin-bottom: 5px;">
                      <span style="background-color: #8B4513; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 10px;">
                        ${index + 1}
                      </span>
                      <strong style="color: #1f2937; font-size: 16px;">${pick.game}</strong>
                    </div>
                    <div style="margin-left: 34px;">
                      <div style="color: #4b5563; font-size: 14px; margin-bottom: 4px;">
                        <strong>Your Pick:</strong> ${pick.pick}
                        ${pick.isLock ? '<span style="color: #f59e0b; font-weight: bold; margin-left: 8px;">🔒 LOCK PICK</span>' : ''}
                      </div>
                      <div style="color: #6b7280; font-size: 12px;">
                        Locks at: ${pick.lockTime}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          
          <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 30px 0;">
            <h4 style="color: #92400e; margin-top: 0; font-size: 16px;">📋 Important Reminders:</h4>
            <div style="color: #92400e; font-size: 14px; line-height: 1.5;">
              <p>• Your picks are now locked and cannot be changed after each game's lock time</p>
              <p>• Points: 20 base + margin bonuses (1, 3, or 5 pts for covering by 11+, 20+, 29+ points)</p>
              <p>• Lock Pick: Doubles your margin bonus for that game</p>
              <p>• You can edit picks until each game locks, but must resubmit</p>
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/picks" 
               style="background-color: #8B4513; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; margin-right: 10px;">
              View Your Picks
            </a>
            <a href="${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/leaderboard" 
               style="background-color: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Check Leaderboard
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            Good luck this week! 🍀<br>
            <em>The Pigskin Pick 6 Pro Team</em>
          </p>
        </div>
      </div>
    `

    const text = `
✅ PICKS CONFIRMED! - Pigskin Pick 6 Pro

Hi ${userDisplayName}!

🎉 Your Week ${week} picks are confirmed!
Submitted on ${submittedStr}

YOUR SUBMITTED PICKS:
${picks.map((pick, index) => 
  `${index + 1}. ${pick.game}
     Pick: ${pick.pick}${pick.isLock ? ' 🔒 LOCK PICK' : ''}
     Locks at: ${pick.lockTime}`
).join('\n\n')}

📋 IMPORTANT REMINDERS:
• Your picks are now locked and cannot be changed after each game's lock time
• Points: 20 base + margin bonuses (1, 3, or 5 pts for covering by 11+, 20+, 29+ points)
• Lock Pick: Doubles your margin bonus for that game
• You can edit picks until each game locks, but must resubmit

View your picks: ${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/picks
Check leaderboard: ${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/leaderboard

Good luck this week! 🍀
The Pigskin Pick 6 Pro Team
    `.trim()

    return {
      subject: `✅ Week ${week} Picks Confirmed - ${picks.length} Games Selected`,
      html,
      text
    }
  }

  static weekOpened(week: number, season: number, deadline: Date, totalGames: number): EmailTemplate {
    const deadlineStr = deadline.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    })

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #8B4513; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🏈 Week ${week} is Open!</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick 6 Pro - ${season} Season</p>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Get Ready for Week ${week}!</h2>
          
          <div style="background-color: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <h3 style="color: #1e40af; margin-top: 0; font-size: 20px;">
              🎯 Picks are now OPEN!
            </h3>
            <p style="color: #1e3a8a; margin: 10px 0; font-size: 16px;">
              <strong>${totalGames} games available</strong> • Choose your 6 best bets
            </p>
            <p style="color: #1e3a8a; margin: 0; font-size: 14px;">
              Deadline: ${deadlineStr}
            </p>
          </div>
          
          <h3 style="color: #1f2937; margin: 20px 0 15px 0;">How to Play:</h3>
          
          <div style="background-color: #f3f4f6; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <div style="display: grid; gap: 15px;">
              <div style="display: flex; align-items: flex-start;">
                <span style="background-color: #8B4513; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px; flex-shrink: 0;">1</span>
                <div>
                  <div style="font-weight: bold; color: #1f2937; margin-bottom: 4px;">Select 6 Games</div>
                  <div style="color: #4b5563; font-size: 14px;">Choose the 6 games you're most confident about from the ${totalGames} available</div>
                </div>
              </div>
              
              <div style="display: flex; align-items: flex-start;">
                <span style="background-color: #f59e0b; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px; flex-shrink: 0;">2</span>
                <div>
                  <div style="font-weight: bold; color: #1f2937; margin-bottom: 4px;">Choose Your Lock 🔒</div>
                  <div style="color: #4b5563; font-size: 14px;">Pick 1 game as your "Lock" to double the margin bonus (most confident pick)</div>
                </div>
              </div>
              
              <div style="display: flex; align-items: flex-start;">
                <span style="background-color: #059669; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; margin-right: 12px; flex-shrink: 0;">3</span>
                <div>
                  <div style="font-weight: bold; color: #1f2937; margin-bottom: 4px;">Submit Before Deadline</div>
                  <div style="color: #4b5563; font-size: 14px;">All picks must be submitted by ${deadlineStr}</div>
                </div>
              </div>
            </div>
          </div>
          
          <div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h4 style="color: #065f46; margin-top: 0; font-size: 16px;">💰 Scoring System:</h4>
            <div style="color: #047857; font-size: 14px; line-height: 1.6;">
              <div><strong>Base Points:</strong> 20 points for each winning pick</div>
              <div><strong>Margin Bonuses:</strong></div>
              <div style="margin-left: 20px;">
                • Cover by 11-19 points: +1 bonus point<br>
                • Cover by 20-28 points: +3 bonus points<br>
                • Cover by 29+ points: +5 bonus points
              </div>
              <div><strong>Lock Bonus:</strong> Doubles the margin bonus for your Lock pick</div>
              <div><strong>Push:</strong> 10 points (tie against the spread)</div>
            </div>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/picks" 
               style="background-color: #8B4513; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 18px;">
              Make Your Picks Now!
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            Don't wait until the last minute! 🏃‍♂️<br>
            <em>The Pigskin Pick 6 Pro Team</em>
          </p>
        </div>
      </div>
    `

    const text = `
🏈 WEEK ${week} IS OPEN! - Pigskin Pick 6 Pro

Get Ready for Week ${week}!

🎯 PICKS ARE NOW OPEN!
${totalGames} games available • Choose your 6 best bets
Deadline: ${deadlineStr}

HOW TO PLAY:
1. SELECT 6 GAMES
   Choose the 6 games you're most confident about from the ${totalGames} available

2. CHOOSE YOUR LOCK 🔒  
   Pick 1 game as your "Lock" to double the margin bonus (most confident pick)

3. SUBMIT BEFORE DEADLINE
   All picks must be submitted by ${deadlineStr}

💰 SCORING SYSTEM:
Base Points: 20 points for each winning pick
Margin Bonuses:
  • Cover by 11-19 points: +1 bonus point
  • Cover by 20-28 points: +3 bonus points  
  • Cover by 29+ points: +5 bonus points
Lock Bonus: Doubles the margin bonus for your Lock pick
Push: 10 points (tie against the spread)

Make your picks now: ${typeof window !== 'undefined' ? window.location.origin : 'https://your-app.com'}/picks

Don't wait until the last minute! 🏃‍♂️
The Pigskin Pick 6 Pro Team
    `.trim()

    return {
      subject: `🏈 Week ${week} Picks are OPEN! ${totalGames} Games Available`,
      html,
      text
    }
  }

  static passwordReset(userDisplayName: string, resetUrl: string): EmailTemplate {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
        <div style="background-color: #8B4513; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">🔐 Password Reset</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Pigskin Pick 6 Pro</p>
        </div>
        
        <div style="background-color: white; padding: 30px; border-radius: 0 0 8px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h2 style="color: #1f2937; margin-top: 0;">Hi ${userDisplayName}!</h2>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.5;">
            A password reset has been requested for your Pigskin Pick 6 Pro account. If you didn't request this reset, you can safely ignore this email.
          </p>
          
          <div style="background-color: #dbeafe; border: 1px solid #3b82f6; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
            <h3 style="color: #1e40af; margin-top: 0; font-size: 18px;">
              🔑 Reset Your Password
            </h3>
            <p style="color: #1e3a8a; margin: 10px 0; font-size: 14px;">
              Click the button below to create a new password for your account.
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background-color: #8B4513; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; font-size: 16px;">
              Reset Password
            </a>
          </div>
          
          <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h4 style="color: #92400e; margin-top: 0; font-size: 14px;">⚠️ Security Notice:</h4>
            <div style="color: #92400e; font-size: 13px; line-height: 1.5;">
              <p style="margin: 5px 0;">• This link will expire in 1 hour for security</p>
              <p style="margin: 5px 0;">• If you didn't request this, please contact an admin</p>
              <p style="margin: 5px 0;">• Never share this reset link with anyone</p>
            </div>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            If the button doesn't work, copy and paste this link:<br>
            <span style="word-break: break-all; color: #3b82f6;">${resetUrl}</span>
          </p>
          
          <p style="color: #6b7280; font-size: 12px; text-align: center; margin-top: 20px;">
            <em>The Pigskin Pick 6 Pro Team</em>
          </p>
        </div>
      </div>
    `

    const text = `
🔐 PASSWORD RESET - Pigskin Pick 6 Pro

Hi ${userDisplayName}!

A password reset has been requested for your Pigskin Pick 6 Pro account. If you didn't request this reset, you can safely ignore this email.

🔑 RESET YOUR PASSWORD
Click this link to create a new password: ${resetUrl}

⚠️ SECURITY NOTICE:
• This link will expire in 1 hour for security
• If you didn't request this, please contact an admin  
• Never share this reset link with anyone

The Pigskin Pick 6 Pro Team
    `.trim()

    return {
      subject: '🔐 Password Reset Request - Pigskin Pick 6 Pro',
      html,
      text
    }
  }
}

/**
 * Email service for managing notifications
 */
export class EmailService {
  /**
   * Schedule a pick reminder email
   */
  static async schedulePickReminder(
    userId: string,
    email: string,
    displayName: string,
    week: number,
    season: number,
    deadline: Date,
    sendTime: Date
  ): Promise<string> {
    try {
      const template = EmailTemplates.pickReminder(displayName, week, season, deadline)
      
      const { data, error } = await supabase
        .from('email_jobs')
        .insert({
          user_id: userId,
          email,
          template_type: 'pick_reminder',
          subject: template.subject,
          html_content: template.html,
          text_content: template.text,
          scheduled_for: sendTime.toISOString(),
          status: 'pending',
          attempts: 0
        })
        .select()
        .single()

      if (error) throw error
      
      console.log(`📧 Scheduled pick reminder for ${email} at ${sendTime.toISOString()}`)
      return data.id
    } catch (error) {
      console.error('Error scheduling pick reminder:', error)
      throw error
    }
  }

  /**
   * Schedule deadline alert emails
   */
  static async scheduleDeadlineAlerts(
    userId: string,
    email: string,
    displayName: string,
    week: number,
    season: number,
    deadline: Date
  ): Promise<string[]> {
    try {
      const jobIds: string[] = []
      
      // Schedule 24-hour alert
      const alert24h = new Date(deadline.getTime() - (24 * 60 * 60 * 1000))
      if (alert24h > new Date()) {
        const template24h = EmailTemplates.deadlineAlert(displayName, week, season, deadline, 24)
        
        const { data: job24h, error: error24h } = await supabase
          .from('email_jobs')
          .insert({
            user_id: userId,
            email,
            template_type: 'deadline_alert',
            subject: template24h.subject,
            html_content: template24h.html,
            text_content: template24h.text,
            scheduled_for: alert24h.toISOString(),
            status: 'pending',
            attempts: 0
          })
          .select()
          .single()

        if (error24h) throw error24h
        jobIds.push(job24h.id)
      }
      
      // Schedule 2-hour alert
      const alert2h = new Date(deadline.getTime() - (2 * 60 * 60 * 1000))
      if (alert2h > new Date()) {
        const template2h = EmailTemplates.deadlineAlert(displayName, week, season, deadline, 2)
        
        const { data: job2h, error: error2h } = await supabase
          .from('email_jobs')
          .insert({
            user_id: userId,
            email,
            template_type: 'deadline_alert',
            subject: template2h.subject,
            html_content: template2h.html,
            text_content: template2h.text,
            scheduled_for: alert2h.toISOString(),
            status: 'pending',
            attempts: 0
          })
          .select()
          .single()

        if (error2h) throw error2h
        jobIds.push(job2h.id)
      }
      
      console.log(`📧 Scheduled ${jobIds.length} deadline alerts for ${email}`)
      return jobIds
    } catch (error) {
      console.error('Error scheduling deadline alerts:', error)
      throw error
    }
  }

  /**
   * Send weekly results email
   */
  static async sendWeeklyResults(
    userId: string,
    email: string,
    displayName: string,
    week: number,
    season: number,
    userStats: any
  ): Promise<string> {
    try {
      const template = EmailTemplates.weeklyResults(displayName, week, season, userStats)
      
      const { data, error } = await supabase
        .from('email_jobs')
        .insert({
          user_id: userId,
          email,
          template_type: 'weekly_results',
          subject: template.subject,
          html_content: template.html,
          text_content: template.text,
          scheduled_for: new Date().toISOString(), // Send immediately
          status: 'pending',
          attempts: 0
        })
        .select()
        .single()

      if (error) throw error
      
      console.log(`📧 Queued weekly results email for ${email}`)
      return data.id
    } catch (error) {
      console.error('Error sending weekly results:', error)
      throw error
    }
  }

  /**
   * Send pick confirmation email when user submits picks
   */
  static async sendPickConfirmation(
    userId: string,
    email: string,
    displayName: string,
    week: number,
    season: number,
    picks: Array<{
      game: string
      pick: string
      isLock: boolean
      lockTime: string
    }>,
    submittedAt: Date
  ): Promise<string> {
    try {
      const template = EmailTemplates.picksSubmitted(displayName, week, season, picks, submittedAt)
      
      const { data, error } = await supabase
        .from('email_jobs')
        .insert({
          user_id: userId,
          email,
          template_type: 'picks_submitted',
          subject: template.subject,
          html_content: template.html,
          text_content: template.text,
          scheduled_for: new Date().toISOString(), // Send immediately
          status: 'pending',
          attempts: 0
        })
        .select()
        .single()

      if (error) throw error
      
      console.log(`📧 Queued pick confirmation email for ${email}`)
      return data.id
    } catch (error) {
      console.error('Error sending pick confirmation:', error)
      throw error
    }
  }

  /**
   * Send week opened announcement to all active users
   */
  static async sendWeekOpenedAnnouncement(
    week: number,
    season: number,
    deadline: Date,
    totalGames: number
  ): Promise<string[]> {
    try {
      console.log(`📧 Sending week opened announcement for Week ${week}`)
      
      // Get all active users (paid users who have email notifications enabled)
      const users = await this.getActiveUsers(season)
      
      if (!users || users.length === 0) {
        console.log('📧 No active users to notify for week opened')
        return []
      }

      const jobIds: string[] = []
      const template = EmailTemplates.weekOpened(week, season, deadline, totalGames)

      for (const user of users) {
        try {
          const { data, error } = await supabase
            .from('email_jobs')
            .insert({
              user_id: user.id,
              email: user.email,
              template_type: 'week_opened',
              subject: template.subject,
              html_content: template.html,
              text_content: template.text,
              scheduled_for: new Date().toISOString(), // Send immediately
              status: 'pending',
              attempts: 0
            })
            .select()
            .single()

          if (error) throw error
          jobIds.push(data.id)
        } catch (error) {
          console.error(`Error queuing week opened email for user ${user.id}:`, error)
        }
      }

      console.log(`📧 Queued ${jobIds.length} week opened emails for ${users.length} active users`)
      return jobIds
    } catch (error) {
      console.error('Error sending week opened announcement:', error)
      throw error
    }
  }

  /**
   * Get users who should receive notifications (only active/paid users)
   */
  static async getUsersForNotification(
    notificationType: keyof UserPreferences,
    season: number,
    week: number
  ): Promise<Array<{
    id: string
    email: string
    display_name: string
    preferences: UserPreferences
  }>> {
    try {
      // Get users with notification preferences enabled first
      const { data: allUsers, error: usersError } = await supabase
        .from('users')
        .select('id, email, display_name, preferences')
        .eq('preferences->>email_notifications', true)
        .eq(`preferences->>${notificationType}`, true)

      if (usersError) throw usersError

      // Get paid users for this season
      const { data: paidUsers, error: paymentsError } = await supabase
        .from('leaguesafe_payments')
        .select('user_id')
        .eq('season', season)
        .eq('status', 'Paid')
        .in('user_id', allUsers?.map(u => u.id) || [])

      if (paymentsError) throw paymentsError

      // Filter users to only those who are paid
      const paidUserIds = new Set(paidUsers?.map(p => p.user_id) || [])
      const users = allUsers?.filter(user => paidUserIds.has(user.id)) || []

      // Return the filtered users (already in the correct format)
      const flattenedUsers = users
      
      // Filter out users who already have picks submitted if it's a pick reminder
      if (notificationType === 'pick_reminders') {
        const userIds = flattenedUsers.map(u => u.id)
        
        const { data: submittedPicks, error: picksError } = await supabase
          .from('picks')
          .select('user_id')
          .eq('season', season)
          .eq('week', week)
          .eq('submitted', true)
          .in('user_id', userIds)

        if (picksError) throw picksError
        
        const submittedUserIds = new Set(submittedPicks?.map(p => p.user_id) || [])
        return flattenedUsers.filter(user => !submittedUserIds.has(user.id))
      }
      
      return flattenedUsers
    } catch (error) {
      console.error('Error getting users for notification:', error)
      throw error
    }
  }

  /**
   * Get all active (paid) users for general notifications like week opened
   */
  static async getActiveUsers(season: number): Promise<Array<{
    id: string
    email: string
    display_name: string
    preferences: UserPreferences
  }>> {
    try {
      // Get users with email notifications enabled first
      const { data: allUsers, error: usersError } = await supabase
        .from('users')
        .select('id, email, display_name, preferences')
        .eq('preferences->>email_notifications', true)

      if (usersError) throw usersError

      // Get paid users for this season
      const { data: paidUsers, error: paymentsError } = await supabase
        .from('leaguesafe_payments')
        .select('user_id')
        .eq('season', season)
        .eq('status', 'Paid')
        .in('user_id', allUsers?.map(u => u.id) || [])

      if (paymentsError) throw paymentsError

      // Filter users to only those who are paid
      const paidUserIds = new Set(paidUsers?.map(p => p.user_id) || [])
      const users = allUsers?.filter(user => paidUserIds.has(user.id)) || []

      // Return the filtered users (already in the correct format)
      return users
    } catch (error) {
      console.error('Error getting active users:', error)
      throw error
    }
  }

  /**
   * Process pending email jobs (would be called by a background job)
   */
  static async processPendingEmails(): Promise<{ processed: number; errors: number }> {
    try {
      console.log('📧 Processing pending email jobs...')
      
      // Get pending jobs that are scheduled for now or earlier
      const { data: pendingJobs, error } = await supabase
        .from('email_jobs')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString())
        .lt('attempts', 3) // Max 3 retry attempts
        .order('scheduled_for', { ascending: true })
        .limit(50)

      if (error) throw error

      if (!pendingJobs || pendingJobs.length === 0) {
        console.log('📧 No pending emails to process')
        return { processed: 0, errors: 0 }
      }

      let processed = 0
      let errors = 0

      // Process each email job
      for (const job of pendingJobs) {
        try {
          // Here you would integrate with your email provider (SendGrid, AWS SES, etc.)
          // For now, we'll just log the email and mark as sent
          console.log(`📧 Processing email job ${job.id}: ${job.subject} -> ${job.email}`)
          
          // TODO: Replace with actual email sending logic
          const emailSent = await this.sendEmail(job)
          
          if (emailSent) {
            // Mark as sent
            await supabase
              .from('email_jobs')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                attempts: job.attempts + 1
              })
              .eq('id', job.id)
            
            processed++
            console.log(`✅ Email sent successfully: ${job.id}`)
          } else {
            throw new Error('Email sending failed')
          }
        } catch (error) {
          console.error(`❌ Error processing email job ${job.id}:`, error)
          
          // Update attempt count and error message
          await supabase
            .from('email_jobs')
            .update({
              status: job.attempts >= 2 ? 'failed' : 'pending',
              attempts: job.attempts + 1,
              error_message: error instanceof Error ? error.message : String(error)
            })
            .eq('id', job.id)
          
          errors++
        }
      }

      console.log(`📧 Email processing complete: ${processed} sent, ${errors} errors`)
      return { processed, errors }
      
    } catch (error) {
      console.error('Error processing pending emails:', error)
      throw error
    }
  }

  /**
   * Send email using Resend email service
   */
  private static async sendEmail(job: EmailJob): Promise<boolean> {
    try {
      const apiKey = import.meta.env.VITE_RESEND_API_KEY
      
      if (!apiKey) {
        console.error('❌ VITE_RESEND_API_KEY not found in environment variables')
        console.log('📧 FALLBACK: Mock email send (no API key)')
        console.log(`   To: ${job.email}`)
        console.log(`   Subject: ${job.subject}`)
        console.log(`   Type: ${job.template_type}`)
        return true // Return true for development
      }

      const resend = new Resend(apiKey)

      console.log(`📧 SENDING EMAIL via Resend:`)
      console.log(`   To: ${job.email}`)
      console.log(`   Subject: ${job.subject}`)
      console.log(`   Type: ${job.template_type}`)

      const { data, error } = await resend.emails.send({
        from: 'Pigskin Pick 6 Pro <noreply@pigskinpick6.com>', // You'll need to verify this domain
        to: [job.email],
        subject: job.subject,
        html: job.html_content,
        text: job.text_content,
      })

      if (error) {
        console.error('❌ Resend error:', error)
        return false
      }

      console.log('✅ Email sent successfully via Resend:', data?.id)
      return true

    } catch (error) {
      console.error('❌ Error sending email:', error)
      return false
    }
  }

  /**
   * Send password reset email
   */
  static async sendPasswordReset(
    userId: string,
    email: string,
    displayName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔐 Sending password reset email to ${email}`)

      // Generate password reset link using Supabase Auth
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      if (error) {
        console.error('❌ Error generating password reset:', error)
        return { success: false, error: error.message }
      }

      console.log('✅ Password reset email sent via Supabase Auth')
      return { success: true }

    } catch (error: any) {
      console.error('❌ Exception sending password reset:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Cancel scheduled emails for a user/week (useful when picks are submitted)
   */
  static async cancelScheduledEmails(
    userId: string,
    templateTypes: string[],
    season: number,
    week: number
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('email_jobs')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'pending')
        .in('template_type', templateTypes)
        .gte('scheduled_for', new Date().toISOString())

      if (error) throw error
      
      console.log(`📧 Cancelled scheduled emails for user ${userId}`)
    } catch (error) {
      console.error('Error cancelling scheduled emails:', error)
      throw error
    }
  }
}