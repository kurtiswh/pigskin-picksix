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
  static async onWeekOpened(week: number, season: number, _deadline?: Date, _totalGames?: number): Promise<void> {
    // _deadline and _totalGames are ignored: queue_week_opened_announcement reads
    // both from week_settings and games so the email cannot disagree with the
    // site. Kept in the signature because callers still pass them positionally.
    try {
      console.log(`📅 Scheduling notifications for Week ${week}, ${season}`)
      
      // Check if open picks notifications are enabled
      const openPicksEnabled = await AdminEmailSettingsService.isOpenPicksNotificationEnabled(season)
      
      if (openPicksEnabled) {
        // Send immediate "week opened" announcement to all active users
        try {
          // Queued server-side; `deadline` and `totalGames` are re-derived from
          // week_settings and games so the email cannot disagree with the site.
          const { data, error: annError } = await supabase.rpc('queue_week_opened_announcement', {
            p_week: week,
            p_season: season,
          })
          if (annError) throw annError
          console.log(`📧 Week opened announcement queued for ${(data as { queued?: number })?.queued ?? 0} players`)
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

      // One statement instead of a nested loop over users x reminder hours.
      // queue_pick_reminders picks the audience, skips anyone who has already
      // submitted, drops send times that have passed, and stores a payload
      // rather than HTML — so nothing here renders or even sees an email.
      const { data, error } = await supabase.rpc('queue_pick_reminders', {
        p_week: week,
        p_season: season,
        p_reminder_hours: reminderTimes,
        p_alert_hours: [],
      })
      if (error) throw error

      const queued = (data as { queued?: number } | null)?.queued ?? 0
      console.log(`📧 Scheduled ${queued} reminders for Week ${week} using admin settings`)

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
  ): Promise<boolean> {
    try {
      console.log(`📧 Processing pick submission for user ${userId}, Week ${week}`)
      
      // Cancel pending pick reminders and deadline alerts for this user/week
      await EmailService.cancelScheduledEmails(
        userId,
        ['pick_reminder', 'deadline_alert'],
        season,
        week
      )

      // Send pick confirmation email.
      //
      // Queued and rendered server-side: the RPC reads the submitted picks back
      // out of the database and addresses the mail to the account's own email,
      // so the browser supplies no recipient and no body. `userEmail`,
      // `displayName` and `picks` stay in the signature for the caller's
      // logging and for cancelScheduledEmails above.
      try {
        console.log(`📤 Sending pick confirmation for ${displayName} <${userEmail}> (${userId}, ${picks.length} picks)`)

        const success = await EmailService.sendPickConfirmationServerRendered(week, season)

        if (success) {
          console.log(`✅ Pick confirmation email sent for user ${userId}`)
          return true
        } else {
          console.warn(`⚠️ Pick confirmation did not send for user ${userId}`)
          console.log(`💡 Email remains queued - can be sent via manual processing`)
        }
      } catch (error) {
        console.error(`Error sending pick confirmation for user ${userId}:`, error)
        // Don't fail the submission for email errors
      }

    } catch (error) {
      console.error(`Error processing pick submission notifications for user ${userId}:`, error)
    }

    // Reached only when the confirmation did not queue and send. The caller
    // surfaces this: a submission that saves correctly but sends no email used
    // to be a console warning nobody saw.
    return false
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
      
      // Each player's stats are read out of weekly_leaderboard and
      // season_leaderboard by the RPC. The browser used to fetch every player's
      // picks and rankings one at a time just to mail them back — and it sent
      // the weekly points as the season figure, because getUserWeekStats never
      // had the season numbers to give.
      const { data, error } = await supabase.rpc('queue_weekly_results', {
        p_week: week,
        p_season: season,
      })
      if (error) throw error

      const queued = (data as { queued?: number } | null)?.queued ?? 0
      console.log(`📧 Queued ${queued} weekly results emails`)

    } catch (error) {
      console.error('Error sending weekly results:', error)
      throw error
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

}