/**
 * Notification Scheduler Service
 * Handles scheduling of email notifications based on user preferences and game/week events
 */

import { supabase } from '@/lib/supabase'
import { EmailService } from './emailService'
import { AdminEmailSettingsService } from './adminEmailSettings'

export interface NotificationEvent {
  type: 'week_opened' | 'picks_submitted' | 'week_completed' | 'deadline_approaching'
  userId?: string
  week: number
  season: number
  data?: any
}

/**
 * Notification scheduler for managing email campaigns
 */
export class NotificationScheduler {
  
  /**
   * Schedule all notifications when a new week is opened for picks
   */
  static async onWeekOpened(week: number, season: number, deadline: Date, totalGames: number = 15): Promise<void> {
    try {
      console.log(`📅 Scheduling notifications for Week ${week}, ${season}`)
      
      // Check if open picks notifications are enabled
      const openPicksEnabled = await AdminEmailSettingsService.isOpenPicksNotificationEnabled(season)
      
      if (openPicksEnabled) {
        // Send immediate "week opened" announcement to all active users
        try {
          await EmailService.sendWeekOpenedAnnouncement(week, season, deadline, totalGames)
          console.log('📧 Week opened announcement sent')
        } catch (error) {
          console.error('Error sending week opened announcement:', error)
          // Don't fail the whole process if this fails
        }
      } else {
        console.log('📧 Week opened notifications disabled by admin')
      }
      
      // Get admin-configured reminder times
      const reminderTimes = await AdminEmailSettingsService.getEnabledReminderTimes(season)
      
      if (reminderTimes.length === 0) {
        console.log('📧 All reminders disabled by admin')
        return
      }

      // Get all users with notification preferences enabled for ongoing reminders
      const users = await EmailService.getUsersForNotification('pick_reminders', season, week)
      
      if (!users || users.length === 0) {
        console.log('📧 No users to notify for pick reminders')
        return
      }

      let totalRemindersScheduled = 0

      for (const user of users) {
        try {
          if (user.preferences.pick_reminders) {
            // Schedule reminders based on admin configuration
            for (const hoursBeforeDeadline of reminderTimes) {
              const reminderTime = new Date(deadline.getTime() - (hoursBeforeDeadline * 60 * 60 * 1000))
              
              // Only schedule if reminder time is in the future
              if (reminderTime > new Date()) {
                await EmailService.schedulePickReminder(
                  user.id,
                  user.email,
                  user.display_name,
                  week,
                  season,
                  deadline,
                  reminderTime
                )
                totalRemindersScheduled++
                console.log(`📧 Scheduled ${hoursBeforeDeadline}h reminder for ${user.display_name} at ${reminderTime.toLocaleString()}`)
              }
            }
          }

        } catch (error) {
          console.error(`Error scheduling notifications for user ${user.id}:`, error)
        }
      }

      console.log(`📧 Scheduled ${totalRemindersScheduled} total reminders for ${users.length} users using admin settings`)

    } catch (error) {
      console.error('Error scheduling week notifications:', error)
      throw error
    }
  }

  /**
   * Handle picks submission - cancel reminders and send confirmation
   */
  static async onPicksSubmitted(
    userId: string, 
    userEmail: string,
    displayName: string,
    week: number, 
    season: number,
    picks: Array<{
      game: string
      pick: string
      spread: number
      isLock: boolean
      lockTime: string
    }>
  ): Promise<void> {
    try {
      console.log(`📧 Processing pick submission for user ${userId}, Week ${week}`)
      
      // Cancel pending pick reminders and deadline alerts for this user/week
      await EmailService.cancelScheduledEmails(
        userId,
        ['pick_reminder', 'deadline_alert'],
        season,
        week
      )

      // Send pick confirmation email
      try {
        console.log(`🔧 DEBUG: Starting email confirmation process for user ${userId}`)
        console.log(`🔧 DEBUG: Email: ${userEmail}, Display Name: ${displayName}`)
        console.log(`🔧 DEBUG: Week ${week}, Season ${season}`)
        console.log(`🔧 DEBUG: Picks count: ${picks.length}`)
        
        const jobId = await EmailService.sendPickConfirmation(
          userId,
          userEmail,
          displayName,
          week,
          season,
          picks,
          new Date()
        )
        console.log(`📧 Queued pick confirmation email for user ${userId}, job ID: ${jobId}`)
        
        // Send email immediately using direct approach (bypass processPendingEmailById)
        try {
          console.log(`🔧 DEBUG: About to call sendPickConfirmationDirect...`)
          console.log(`🔧 DEBUG: EmailService object:`, typeof EmailService)
          console.log(`🔧 DEBUG: sendPickConfirmationDirect method:`, typeof EmailService.sendPickConfirmationDirect)
          
          console.log(`📤 Sending pick confirmation email immediately for user ${userId}`)
          
          // Call the EmailService sendPickConfirmationDirect method (simpler approach)
          const success = await EmailService.sendPickConfirmationDirect(
            userId,
            userEmail,
            displayName,
            week,
            season,
            picks,
            new Date()
          )
          
          console.log(`🔧 DEBUG: sendPickConfirmationDirect returned: ${success}`)
          
          if (success) {
            console.log(`✅ Pick confirmation email sent immediately for user ${userId}`)
            
            // Update the job status to sent
            const { error: updateError } = await supabase
              .from('email_jobs')
              .update({
                status: 'sent',
                sent_at: new Date().toISOString(),
                attempts: 1
              })
              .eq('id', jobId)
              
            if (updateError) {
              console.warn('Could not update email job status:', updateError)
            } else {
              console.log(`📋 Job status updated to sent for ${jobId}`)
            }
          } else {
            console.warn(`⚠️ Direct email sending failed for user ${userId}`)
            console.log(`💡 Email remains queued - can be sent via manual processing`)
          }
        } catch (processError) {
          console.error(`❌ CRITICAL ERROR in immediate send for user ${userId}:`, processError)
          console.error(`❌ Error details:`, processError.message)
          console.error(`❌ Error stack:`, processError.stack)
          console.log(`💡 Email queued - can be sent via manual queue processing`)
        }
      } catch (error) {
        console.error(`Error sending pick confirmation for user ${userId}:`, error)
        // Don't fail the submission for email errors
      }

    } catch (error) {
      console.error(`Error processing pick submission notifications for user ${userId}:`, error)
    }
  }

  /**
   * Send weekly results when week is completed and scored
   */
  static async onWeekCompleted(week: number, season: number): Promise<void> {
    try {
      console.log(`📊 Processing weekly results for Week ${week}, ${season}`)
      
      // Check if weekly results feature is enabled (for manual sending)
      const resultsEnabled = await AdminEmailSettingsService.isWeeklyResultsEnabled(season)
      
      if (!resultsEnabled) {
        console.log('📊 Weekly results feature disabled by admin')
        return
      }
      
      console.log('📧 Sending weekly results manually (no auto-send with new manual-only approach)')
      
      // Get all users with weekly results notifications enabled
      const users = await EmailService.getUsersForNotification('weekly_results', season, week)
      
      if (!users || users.length === 0) {
        console.log('📧 No users to notify for weekly results')
        return
      }

      let resultsSent = 0

      for (const user of users) {
        try {
          // Get user's stats for this week
          const userStats = await this.getUserWeekStats(user.id, week, season)
          
          if (userStats) {
            await EmailService.sendWeeklyResults(
              user.id,
              user.email,
              user.display_name,
              week,
              season,
              userStats
            )
            resultsSent++
          }

        } catch (error) {
          console.error(`Error sending weekly results for user ${user.id}:`, error)
        }
      }

      console.log(`📧 Scheduled ${resultsSent} weekly results emails`)

    } catch (error) {
      console.error('Error sending weekly results:', error)
      throw error
    }
  }

  /**
   * Calculate reminder time based on admin settings
   * @deprecated - Now uses admin-configurable schedules in onWeekOpened
   */
  private static calculateReminderTime(deadline: Date): Date {
    const now = new Date()
    const reminderTime = new Date(deadline.getTime() - (2 * 60 * 60 * 1000)) // 2 hours before (default)
    
    // If reminder time is in the past, schedule for 1 hour from now
    if (reminderTime <= now) {
      return new Date(now.getTime() + (60 * 60 * 1000)) // 1 hour from now
    }
    
    return reminderTime
  }

  /**
   * Get user's statistics for a completed week
   */
  private static async getUserWeekStats(userId: string, week: number, season: number): Promise<any> {
    try {
      // Get user's picks for this week
      const { data: picks, error: picksError } = await supabase
        .from('picks')
        .select(`
          *,
          game:games(*)
        `)
        .eq('user_id', userId)
        .eq('week', week)
        .eq('season', season)
        .eq('submitted', true)

      if (picksError) throw picksError
      if (!picks || picks.length === 0) return null

      // Calculate user's total points for the week
      const totalPoints = picks.reduce((sum, pick) => sum + (pick.points_earned || 0), 0)
      
      // Calculate record
      const wins = picks.filter(p => p.result === 'win').length
      const losses = picks.filter(p => p.result === 'loss').length  
      const pushes = picks.filter(p => p.result === 'push').length
      const record = `${wins}-${losses}${pushes > 0 ? `-${pushes}` : ''}`

      // Get user's rank for this week
      const { data: rankings, error: rankError } = await supabase
        .rpc('get_weekly_leaderboard', { 
          season_param: season,
          week_param: week
        })

      if (rankError) throw rankError

      const userRank = rankings?.findIndex(r => r.user_id === userId) + 1 || 0
      const totalPlayers = rankings?.length || 0

      // Format picks for email
      const formattedPicks = picks.map(pick => ({
        game: `${pick.game.away_team} @ ${pick.game.home_team}`,
        pick: pick.selected_team,
        result: pick.result,
        points: pick.points_earned || 0,
        isLock: pick.is_lock
      }))

      return {
        points: totalPoints,
        record,
        rank: userRank,
        totalPlayers,
        picks: formattedPicks
      }

    } catch (error) {
      console.error(`Error getting user week stats for ${userId}:`, error)
      return null
    }
  }

  /**
   * Manual trigger for processing email jobs (could be called by cron job)
   */
  static async processEmailQueue(): Promise<{ processed: number; errors: number }> {
    try {
      return await EmailService.processPendingEmails()
    } catch (error) {
      console.error('Error processing email queue:', error)
      throw error
    }
  }

  /**
   * Test notification system with sample data
   */
  static async testNotifications(userId: string): Promise<void> {
    try {
      console.log(`🧪 Testing notification system for user ${userId}`)
      
      // Get user details
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) throw error
      if (!user) throw new Error('User not found')

      const currentSeason = new Date().getFullYear()
      const testWeek = 1
      const testDeadline = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)) // 1 week from now

      console.log(`📧 Scheduling test notifications for ${user.display_name} (${user.email})`)

      // Test pick reminder
      const reminderTime = new Date(Date.now() + (5 * 60 * 1000)) // 5 minutes from now
      await EmailService.schedulePickReminder(
        user.id,
        user.email,
        user.display_name,
        testWeek,
        currentSeason,
        testDeadline,
        reminderTime
      )

      // Test deadline alerts
      await EmailService.scheduleDeadlineAlerts(
        user.id,
        user.email,
        user.display_name,
        testWeek,
        currentSeason,
        testDeadline
      )

      // Test weekly results with mock data
      const mockStats = {
        points: 85,
        record: '4-2',
        rank: 3,
        totalPlayers: 25,
        picks: [
          {
            game: 'Georgia @ Alabama',
            pick: 'Alabama',
            result: 'win' as const,
            points: 25,
            isLock: true
          },
          {
            game: 'Michigan @ Ohio State',
            pick: 'Ohio State', 
            result: 'win' as const,
            points: 20,
            isLock: false
          }
        ]
      }

      await EmailService.sendWeeklyResults(
        user.id,
        user.email,
        user.display_name,
        testWeek,
        currentSeason,
        mockStats
      )

      console.log('✅ Test notifications scheduled successfully')
      console.log('📧 Check email_jobs table and run processEmailQueue() to send them')

    } catch (error) {
      console.error('Error testing notifications:', error)
      throw error
    }
  }
}