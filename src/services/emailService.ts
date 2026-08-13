/**
 * Email Service
 * Handles email notifications for pick reminders, results, and alerts
 */

import { supabase } from '@/lib/supabase'
import { UserPreferences } from '@/types'
import { ENV } from '@/lib/env'
// Email is sent server-side via the Supabase `send-email` Edge Function (which
// holds the Resend secret); the client never instantiates Resend directly.
import {
  getPickReminderSubject, 
  getPickReminderHtml, 
  getPickReminderText 
} from '@/templates/pickReminder'
import { 
  getDeadlineAlertSubject, 
  getDeadlineAlertHtml, 
  getDeadlineAlertText 
} from '@/templates/deadlineAlert'
import { 
  getWeeklyResultsSubject, 
  getWeeklyResultsHtml, 
  getWeeklyResultsText 
} from '@/templates/weeklyResults'
import { 
  getPicksSubmittedSubject, 
  getPicksSubmittedHtml, 
  getPicksSubmittedText 
} from '@/templates/picksSubmitted'
import { 
  getWeekOpenedSubject, 
  getWeekOpenedHtml, 
  getWeekOpenedText 
} from '@/templates/weekOpened'
import { 
  getMagicLinkSubject, 
  getMagicLinkHtml, 
  getMagicLinkText 
} from '@/templates/magicLink'
import { 
  getPasswordResetSubject, 
  getPasswordResetHtml, 
  getPasswordResetText 
} from '@/templates/passwordReset'

export interface EmailTemplate {
  subject: string
  html: string
  text: string
}

/** Only used when VITE_SUPABASE_URL is missing; the project URL is public. */
const FALLBACK_SUPABASE_URL = 'https://zgdaqbnpgrabbnljmiqy.supabase.co'

export interface EmailJob {
  id: string
  user_id: string
  email: string
  template_type: 'pick_reminder' | 'deadline_alert' | 'weekly_results' | 'game_completed' | 'picks_submitted' | 'week_opened' | 'magic_link' | 'password_reset'
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

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
    
    const templateData = {
      userDisplayName,
      week,
      season,
      deadline,
      deadlineStr,
      baseUrl
    }

    return {
      subject: getPickReminderSubject(templateData),
      html: getPickReminderHtml(templateData),
      text: getPickReminderText(templateData)
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

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
    
    const templateData = {
      userDisplayName,
      week,
      season,
      deadline,
      deadlineStr,
      hoursLeft,
      baseUrl
    }

    return {
      subject: getDeadlineAlertSubject(templateData),
      html: getDeadlineAlertHtml(templateData),
      text: getDeadlineAlertText(templateData)
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
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
    
    const templateData = {
      userDisplayName,
      week,
      season,
      baseUrl,
      userStats: {
        weeklyPoints: userStats.points,
        weeklyRank: userStats.rank,
        totalPlayers: userStats.totalPlayers,
        seasonPoints: userStats.points, // This would come from a different source in real usage
        seasonRank: userStats.rank, // This would come from a different source in real usage
        picks: userStats.picks
      }
    }

    return {
      subject: getWeeklyResultsSubject(templateData),
      html: getWeeklyResultsHtml(templateData),
      text: getWeeklyResultsText(templateData)
    }
  }

  static picksSubmitted(
    userDisplayName: string, 
    week: number, 
    season: number,
    picks: Array<{
      game: string
      pick: string
      spread: number
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

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
    
    const templateData = {
      userDisplayName,
      week,
      season,
      picks,
      submittedAt,
      submittedStr,
      baseUrl
    }

    return {
      subject: getPicksSubmittedSubject(templateData),
      html: getPicksSubmittedHtml(templateData),
      text: getPicksSubmittedText(templateData)
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

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://pigskin-picksix.vercel.app'
    
    const templateData = {
      week,
      season,
      deadline,
      deadlineStr,
      totalGames,
      baseUrl
    }

    return {
      subject: getWeekOpenedSubject(templateData),
      html: getWeekOpenedHtml(templateData),
      text: getWeekOpenedText(templateData)
    }
  }

  static magicLink(userDisplayName: string, magicLinkUrl: string): EmailTemplate {
    const templateData = {
      userDisplayName,
      magicLinkUrl
    }

    return {
      subject: getMagicLinkSubject(templateData),
      html: getMagicLinkHtml(templateData),
      text: getMagicLinkText(templateData)
    }
  }

  static passwordReset(userDisplayName: string, resetUrl: string): EmailTemplate {
    const templateData = {
      userDisplayName,
      resetUrl
    }

    return {
      subject: getPasswordResetSubject(templateData),
      html: getPasswordResetHtml(templateData), 
      text: getPasswordResetText(templateData)
    }
  }
}

/**
 * Email service for managing notifications
 */
export class EmailService {
  /**
   * Bearer token for the send-email Edge Function.
   *
   * Prefers the caller's session. The function only accepts an email body from
   * the service role or a signed-in admin — the anon key can do nothing but
   * send a job that was queued for it by an RPC, which is the point — so
   * passing the anon key where a session exists would silently downgrade an
   * admin to no permissions at all.
   */
  private static async edgeFunctionToken(): Promise<string> {
    try {
      const { data } = await supabase.auth.getSession()
      if (data.session?.access_token) return data.session.access_token
    } catch (error) {
      console.warn('Could not read session for Edge Function call:', error)
    }
    return ENV.SUPABASE_ANON_KEY || ''
  }

  /**
   * Queue a pick confirmation server-side and send it.
   *
   * The RPC derives the recipient, the name and every pick from the database;
   * nothing here describes the email. `email` is only needed for anonymous
   * submitters, where it selects whose picks to confirm — and is therefore also
   * the only address the mail can reach.
   */
  static async sendPickConfirmationServerRendered(
    week: number,
    season: number,
    anonymousEmail?: string
  ): Promise<boolean> {
    try {
      const { data, error } = anonymousEmail
        ? await supabase.rpc('queue_anonymous_pick_confirmation', {
            p_email: anonymousEmail,
            p_week: week,
            p_season: season,
          })
        : await supabase.rpc('queue_pick_confirmation', {
            p_week: week,
            p_season: season,
          })

      if (error) throw error

      const job = data as { job_id?: string; send_token?: string } | null
      if (!job?.job_id) throw new Error('Confirmation RPC returned no job id')

      console.log(`📧 Pick confirmation queued (job: ${job.job_id})`)
      return await this.sendQueuedJob(job.job_id, job.send_token)
    } catch (error) {
      console.error('❌ Could not queue/send pick confirmation:', error)
      return false
    }
  }

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
      spread: number
      isLock: boolean
      lockTime: string
    }>,
    submittedAt: Date
  ): Promise<string> {
    try {
      const template = EmailTemplates.picksSubmitted(displayName, week, season, picks, submittedAt)
      
      // Handle anonymous users - set user_id to null for foreign key constraint
      const actualUserId = (userId === 'anonymous' || !userId) ? null : userId
      
      const { data, error } = await supabase
        .from('email_jobs')
        .insert({
          user_id: actualUserId,
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

      if (error) {
        console.error('Error creating email job:', error)
        throw error
      }
      
      console.log(`📧 Queued pick confirmation email for ${email} (user: ${actualUserId || 'anonymous'})`)
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
   * Optimized to avoid URL length issues with large user sets
   */
  /** Grace-period length (weeks) from app_settings; defaults to 2. */
  private static async getGracePeriodWeeks(): Promise<number> {
    try {
      const { data } = await supabase
        .from('app_settings')
        .select('grace_period_weeks')
        .limit(1)
        .maybeSingle()
      return (data as any)?.grace_period_weeks ?? 2
    } catch {
      return 2
    }
  }

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
      // Use a JOIN query to get users with preferences AND payment status in one query
      // This avoids the need for large IN clauses that cause URL length issues
      const { data: usersWithPayments, error: joinError } = await supabase
        .from('users')
        .select(`
          id, 
          email, 
          display_name, 
          preferences,
          leaguesafe_payments!inner(user_id, status)
        `)
        .eq('preferences->>email_notifications', true)
        .eq(`preferences->>${notificationType}`, true)
        .eq('leaguesafe_payments.season', season)
        .eq('leaguesafe_payments.status', 'Paid')

      if (joinError) {
        console.error('Join query failed, falling back to batch processing:', joinError)
        // Fallback to original logic but with batching if JOIN fails
        return await this.getUsersForNotificationFallback(notificationType, season, week)
      }

      let eligibleUsers = usersWithPayments || []
      
      // Filter out users who already have picks submitted if it's a pick reminder
      if (notificationType === 'pick_reminders' && eligibleUsers.length > 0) {
        // Batch process pick checks to avoid URL length issues
        const batchSize = 50 // Process in batches of 50 users
        const usersWithoutPicks: typeof eligibleUsers = []
        
        for (let i = 0; i < eligibleUsers.length; i += batchSize) {
          const batch = eligibleUsers.slice(i, i + batchSize)
          const userIds = batch.map(u => u.id)
          
          const { data: submittedPicks, error: picksError } = await supabase
            .from('picks')
            .select('user_id')
            .eq('season', season)
            .eq('week', week)
            .eq('submitted', true)
            .in('user_id', userIds)

          if (picksError) {
            console.error(`Error checking picks for batch starting at ${i}:`, picksError)
            // Include all users in this batch if check fails (better to over-notify than under-notify)
            usersWithoutPicks.push(...batch)
            continue
          }
          
          const submittedUserIds = new Set(submittedPicks?.map(p => p.user_id) || [])
          const batchWithoutPicks = batch.filter(user => !submittedUserIds.has(user.id))
          usersWithoutPicks.push(...batchWithoutPicks)
        }
        
        eligibleUsers = usersWithoutPicks
      }

      // B5 (roster cleanup): once the season is underway (past the grace period),
      // stop reminding paid users who have never entered ANY week this season —
      // they aren't participating and shouldn't keep getting pick reminders.
      if (notificationType === 'pick_reminders' && eligibleUsers.length > 0) {
        const graceWeeks = await this.getGracePeriodWeeks()
        if (week > graceWeeks) {
          const enteredIds = new Set<string>()
          const batchSize = 50
          for (let i = 0; i < eligibleUsers.length; i += batchSize) {
            const userIds = eligibleUsers.slice(i, i + batchSize).map(u => u.id)
            const { data: seasonPicks } = await supabase
              .from('picks')
              .select('user_id')
              .eq('season', season)
              .eq('submitted', true)
              .in('user_id', userIds)
            for (const p of seasonPicks || []) enteredIds.add(p.user_id)
          }
          eligibleUsers = eligibleUsers.filter(u => enteredIds.has(u.id))
        }
      }

      return eligibleUsers

    } catch (error) {
      console.error('Error getting users for notification:', error)
      // Try fallback method one more time
      try {
        return await this.getUsersForNotificationFallback(notificationType, season, week)
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError)
        throw error
      }
    }
  }

  /**
   * Fallback method using batched queries (slower but more reliable)
   */
  private static async getUsersForNotificationFallback(
    notificationType: keyof UserPreferences,
    season: number,
    week: number
  ): Promise<Array<{
    id: string
    email: string
    display_name: string
    preferences: UserPreferences
  }>> {
    // Get users with notification preferences enabled first
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, email, display_name, preferences')
      .eq('preferences->>email_notifications', true)
      .eq(`preferences->>${notificationType}`, true)

    if (usersError) throw usersError
    if (!allUsers || allUsers.length === 0) return []

    // Process users in batches to avoid URL length issues
    const batchSize = 50
    const paidUsers: string[] = []
    
    for (let i = 0; i < allUsers.length; i += batchSize) {
      const batch = allUsers.slice(i, i + batchSize)
      const userIds = batch.map(u => u.id)
      
      const { data: batchPaidUsers, error: paymentsError } = await supabase
        .from('leaguesafe_payments')
        .select('user_id')
        .eq('season', season)
        .eq('status', 'Paid')
        .in('user_id', userIds)

      if (paymentsError) {
        console.error(`Error checking payments for batch starting at ${i}:`, paymentsError)
        continue // Skip this batch rather than fail completely
      }
      
      paidUsers.push(...(batchPaidUsers?.map(p => p.user_id) || []))
    }

    // Filter users to only those who are paid
    const paidUserIds = new Set(paidUsers)
    const users = allUsers.filter(user => paidUserIds.has(user.id))

    // Filter out users who already have picks submitted if it's a pick reminder
    if (notificationType === 'pick_reminders' && users.length > 0) {
      const usersWithoutPicks: typeof users = []
      
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, i + batchSize)
        const userIds = batch.map(u => u.id)
        
        const { data: submittedPicks, error: picksError } = await supabase
          .from('picks')
          .select('user_id')
          .eq('season', season)
          .eq('week', week)
          .eq('submitted', true)
          .in('user_id', userIds)

        if (picksError) {
          console.error(`Error checking picks for batch starting at ${i}:`, picksError)
          // Include all users in this batch if check fails
          usersWithoutPicks.push(...batch)
          continue
        }
        
        const submittedUserIds = new Set(submittedPicks?.map(p => p.user_id) || [])
        const batchWithoutPicks = batch.filter(user => !submittedUserIds.has(user.id))
        usersWithoutPicks.push(...batchWithoutPicks)
      }
      
      return usersWithoutPicks
    }
    
    return users
  }

  /**
   * Get all active (paid) users for general notifications like week opened
   * Optimized to avoid URL length issues with large user sets
   */
  static async getActiveUsers(season: number): Promise<Array<{
    id: string
    email: string
    display_name: string
    preferences: UserPreferences
  }>> {
    try {
      // Use a JOIN query to get users with preferences AND payment status in one query
      const { data: usersWithPayments, error: joinError } = await supabase
        .from('users')
        .select(`
          id, 
          email, 
          display_name, 
          preferences,
          leaguesafe_payments!inner(user_id, status)
        `)
        .eq('preferences->>email_notifications', true)
        .eq('leaguesafe_payments.season', season)
        .eq('leaguesafe_payments.status', 'Paid')

      if (joinError) {
        console.error('Join query failed, falling back to batch processing:', joinError)
        // Fallback to batch processing
        return await this.getActiveUsersFallback(season)
      }

      return usersWithPayments || []
      
    } catch (error) {
      console.error('Error getting active users:', error)
      // Try fallback method
      try {
        return await this.getActiveUsersFallback(season)
      } catch (fallbackError) {
        console.error('Fallback method also failed:', fallbackError)
        throw error
      }
    }
  }

  /**
   * Fallback method for getting active users using batched queries
   */
  private static async getActiveUsersFallback(season: number): Promise<Array<{
    id: string
    email: string
    display_name: string
    preferences: UserPreferences
  }>> {
    // Get users with email notifications enabled first
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, email, display_name, preferences')
      .eq('preferences->>email_notifications', true)

    if (usersError) throw usersError
    if (!allUsers || allUsers.length === 0) return []

    // Process users in batches to avoid URL length issues
    const batchSize = 50
    const paidUsers: string[] = []
    
    for (let i = 0; i < allUsers.length; i += batchSize) {
      const batch = allUsers.slice(i, i + batchSize)
      const userIds = batch.map(u => u.id)
      
      const { data: batchPaidUsers, error: paymentsError } = await supabase
        .from('leaguesafe_payments')
        .select('user_id')
        .eq('season', season)
        .eq('status', 'Paid')
        .in('user_id', userIds)

      if (paymentsError) {
        console.error(`Error checking payments for batch starting at ${i}:`, paymentsError)
        continue // Skip this batch rather than fail completely
      }
      
      paidUsers.push(...(batchPaidUsers?.map(p => p.user_id) || []))
    }

    // Filter users to only those who are paid
    const paidUserIds = new Set(paidUsers)
    return allUsers.filter(user => paidUserIds.has(user.id))
  }

  /**
   * Process a specific email job by ID
   */
  static async processPendingEmailById(jobId: string): Promise<boolean> {
    try {
      console.log(`📧 Processing specific email job: ${jobId}`)
      
      // Get the specific job
      const { data: job, error } = await supabase
        .from('email_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('status', 'pending')
        .single()

      if (error) {
        console.error(`❌ Error fetching email job ${jobId}:`, error)
        return false
      }

      if (!job) {
        console.log(`📧 No pending email job found with ID: ${jobId}`)
        return false
      }

      try {
        console.log(`📧 Processing specific email job ${job.id}: ${job.subject} -> ${job.email}`)
        
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
          
          console.log(`✅ Email sent successfully: ${job.id}`)
          return true
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
        
        return false
      }
      
    } catch (error) {
      console.error(`❌ Error processing specific email job ${jobId}:`, error)
      return false
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
   * Send an already-queued job by id.
   *
   * The Edge Function reads the recipient and body from email_jobs itself and
   * marks the row sent, so nothing here supplies content. Jobs queued by the
   * queue_* RPCs carry a one-time `sendToken`, which is what lets an anonymous
   * visitor send their own confirmation without being able to send anyone
   * else's.
   */
  static async sendQueuedJob(jobId: string, sendToken?: string): Promise<boolean> {
    try {
      const supabaseUrl = ENV.SUPABASE_URL || FALLBACK_SUPABASE_URL
      const token = await this.edgeFunctionToken()

      const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sendToken ? { jobId, sendToken } : { jobId })
      })

      if (response.ok) {
        const result = await response.json()
        console.log(`✅ Queued email ${jobId} sent:`, result?.messageId ?? '(already sent)')
        return true
      }

      const errorText = await response.text()
      console.error(`❌ Sending queued email ${jobId} failed:`, response.status, errorText)
      return false
    } catch (error) {
      console.error(`❌ Exception sending queued email ${jobId}:`, error)
      return false
    }
  }

  /**
   * Send a pending job through the queue processor.
   * Goes out by job id so the server, not this browser, decides the content.
   */
  private static async sendEmail(job: EmailJob): Promise<boolean> {
    console.log(`📧 SENDING EMAIL: ${job.template_type} -> ${job.email}`)
    return await this.sendQueuedJob(job.id)
  }

  // sendPickConfirmationDirect used to render a confirmation in the browser and
  // post the HTML to send-email. That path is gone: use
  // sendPickConfirmationServerRendered, which queues the job through an RPC and
  // lets the server render it from the picks already in the database.

  /**
   * Send email directly without going through the job queue processing
   * This is used for immediate email sending during pick submission
   */
  static async sendEmailDirect(
    to: string,
    subject: string,
    html: string,
    text: string,
    /** Bulk sends only — adds the List-Unsubscribe header via the Edge Function. */
    unsubscribeUrl?: string
  ): Promise<boolean> {
    try {
      console.log(`📧 SENDING EMAIL DIRECTLY:`)
      console.log(`   To: ${to}`)
      console.log(`   Subject: ${subject}`)

      const supabaseUrl = ENV.SUPABASE_URL || FALLBACK_SUPABASE_URL
      // Must be the caller's own session: send-email accepts a body only from
      // an admin or the service role. Recap blasts and preseason test sends are
      // admin actions, so the admin's token is what authorizes them.
      const token = await this.edgeFunctionToken()

      const response = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to,
          subject,
          html,
          text,
          ...(unsubscribeUrl ? { unsubscribeUrl } : {}),
          from: 'Pigskin Pick Six <admin@pigskinpicksix.com>'
        })
      })

      console.log(`📡 Direct send response status: ${response.status}`)

      if (response.ok) {
        const result = await response.json()
        console.log('✅ Email sent directly via Edge Function:', result?.messageId)
        return true
      } else {
        const errorText = await response.text()
        console.error('❌ Direct email sending failed:', response.status, errorText)
        return false
      }

    } catch (error) {
      console.error('❌ Direct email sending exception:', error)
      return false
    }
  }

  // Removed: sendMagicLink, sendPasswordResetViaResend and sendPasswordReset.
  //
  // All three were dead — nothing called them. The first two queued a
  // client-rendered body into email_jobs and then drained the queue to send it,
  // which is exactly the pattern migrations 201/202 exist to stop; they would
  // now be refused by send-email and by the table's INSERT policy. Both were
  // also already broken independently, writing the strings 'magic-link-user'
  // and 'password-reset-user' into email_jobs.user_id, a uuid column.
  //
  // Password resets go through supabase.auth.resetPasswordForEmail (see
  // UserManagement). The magic-link templates survive for the EmailDesigns
  // preview gallery via EmailTemplates.magicLink / .passwordReset.

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

// Make EmailService available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).EmailService = EmailService
  console.log('🛠️ EmailService available globally for debugging. Try: EmailService.processPendingEmails()')
}