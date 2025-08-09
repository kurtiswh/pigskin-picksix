/**
 * Notification Scheduler Service
 * Handles scheduling of email notifications based on user preferences and game/week events
 */

import { supabase } from '@/lib/supabase'
import { EmailService } from './emailService'

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
      
      // First, send immediate "week opened" announcement to all active users
      try {
        await EmailService.sendWeekOpenedAnnouncement(week, season, deadline, totalGames)
      } catch (error) {
        console.error('Error sending week opened announcement:', error)
        // Don't fail the whole process if this fails
      }
      
      // Get all users with notification preferences enabled for ongoing reminders
      const users = await EmailService.getUsersForNotification('pick_reminders', season, week)
      
      if (!users || users.length === 0) {
        console.log('📧 No users to notify for pick reminders')
        return
      }

      let remindersScheduled = 0
      let alertsScheduled = 0

      for (const user of users) {
        try {
          // Schedule pick reminder (48 hours before deadline or when week opens, whichever is later)
          if (user.preferences.pick_reminders) {
            const reminderTime = this.calculateReminderTime(deadline)
            
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
              remindersScheduled++
            }
          }

          // Schedule deadline alerts
          if (user.preferences.deadline_alerts) {
            const alertIds = await EmailService.scheduleDeadlineAlerts(
              user.id,
              user.email,
              user.display_name,
              week,
              season,
              deadline
            )
            alertsScheduled += alertIds.length
          }

        } catch (error) {
          console.error(`Error scheduling notifications for user ${user.id}:`, error)
        }
      }

      console.log(`📧 Scheduled notifications: ${remindersScheduled} reminders, ${alertsScheduled} alerts for ${users.length} users`)

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
        await EmailService.sendPickConfirmation(
          userId,
          userEmail,
          displayName,
          week,
          season,
          picks,
          new Date()
        )
        console.log(`📧 Queued pick confirmation email for user ${userId}`)
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
      console.log(`📊 Sending weekly results for Week ${week}, ${season}`)
      
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
   * Calculate optimal reminder time (48 hours before deadline, but not earlier than now)
   */
  private static calculateReminderTime(deadline: Date): Date {
    const now = new Date()
    const reminderTime = new Date(deadline.getTime() - (48 * 60 * 60 * 1000)) // 48 hours before
    
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