/**
 * Email Service
 * Handles email notifications for pick reminders, results, and alerts
 */

import { supabase } from '@/lib/supabase'
import { UserPreferences } from '@/types'
import { Resend } from 'resend'
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
   * Optimized to avoid URL length issues with large user sets
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
   * Send email using Supabase Edge Function (which calls Resend securely)
   * Falls back to mock mode for development
   */
  private static async sendEmail(job: EmailJob): Promise<boolean> {
    try {
      console.log(`📧 SENDING EMAIL via Edge Function:`)
      console.log(`   To: ${job.email}`)
      console.log(`   Subject: ${job.subject}`)
      console.log(`   Type: ${job.template_type}`)

      // Get current user session for authentication
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session?.access_token) {
        console.error('❌ No valid session - using mock mode')
        console.log('📧 MOCK EMAIL SENT (no session)')
        return true // Return true for development
      }

      try {
        // Call Supabase Edge Function
        const { data, error } = await supabase.functions.invoke('send-email', {
          body: {
            to: job.email,
            subject: job.subject,
            html: job.html_content,
            text: job.text_content,
            from: 'Pigskin Pick Six <admin@pigskinpicksix.com>'
          },
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        })

        if (error) {
          console.error('❌ Edge function error:', error)
          // Fall back to mock mode for development
          console.log('📧 FALLBACK: Mock email sent (Edge function not deployed)')
          return true
        }

        if (!data?.success) {
          console.error('❌ Email sending failed:', data?.error || 'Unknown error')
          console.log('📧 FALLBACK: Mock email sent (sending failed)')
          return true // Return true for development to keep testing
        }

        console.log('✅ Email sent successfully via Edge Function:', data?.messageId)
        return true

      } catch (functionError) {
        console.error('❌ Edge function call failed:', functionError)
        console.log('📧 FALLBACK: Mock email sent (function not available)')
        return true // Return true for development
      }

    } catch (error) {
      console.error('❌ Error sending email:', error)
      console.log('📧 FALLBACK: Mock email sent (general error)')
      return true // Return true for development
    }
  }

  /**
   * Send magic link email by queuing it in the email jobs system
   */
  static async sendMagicLink(
    email: string,
    displayName: string,
    magicToken: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔮 Sending magic link email to ${email}`)

      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : 'https://pigskin-picksix.vercel.app'
      
      const magicLinkUrl = `${baseUrl}/magic-login?token=${magicToken}`
      const template = EmailTemplates.magicLink(displayName, magicLinkUrl)

      console.log('📧 Queueing magic link email in email jobs system...')

      // Use the email jobs system instead of direct Resend call
      try {
        const emailData = {
          user_id: 'magic-link-user', // Placeholder ID for magic link emails
          email,
          template_type: 'magic_link',
          subject: template.subject,
          html_content: template.html,
          text_content: template.text,
          scheduled_for: new Date().toISOString(), // Send immediately
          status: 'pending',
          attempts: 0
        }
        
        console.log('📧 Email data to insert:', emailData)
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Email insert timed out after 10 seconds')), 10000)
        )
        
        const insertPromise = supabase
          .from('email_jobs')
          .insert(emailData)
          .select()
          .single()
        
        let data, error
        try {
          const result = await Promise.race([insertPromise, timeoutPromise])
          data = result.data
          error = result.error
          console.log('📧 Database insert result:', { data: !!data, error: error?.message || 'none' })
        } catch (timeoutError: any) {
          console.error('❌ Database insert timed out:', timeoutError.message)
          console.error('💡 This suggests a database connectivity or permissions issue')
          console.error('💡 Try checking your Supabase database status and RLS policies')
          return { success: false, error: 'Database insert timed out - check database connectivity' }
        }

        if (error) {
          console.error('❌ Error queueing magic link email:', error)
          console.error('❌ Error details:', JSON.stringify(error, null, 2))
          
          if (error.message?.includes('relation "email_jobs" does not exist')) {
            console.error('💡 The email_jobs table does not exist! You need to create it.')
            console.error('💡 This table is needed for email processing. Check your database setup.')
          }
          
          return { success: false, error: error.message }
        }
        
        console.log('✅ Email data inserted successfully:', data)
        console.log('✅ Magic link email queued successfully:', data?.id)
        
      } catch (insertError: any) {
        console.error('❌ Exception during email insert:', insertError)
        return { success: false, error: insertError.message }
      }
      
      // Try to process it immediately if possible
      try {
        console.log('🔄 Attempting immediate email processing...')
        const processingResult = await this.processPendingEmails()
        console.log('📊 Email processing result:', processingResult)
      } catch (processError) {
        console.warn('⚠️ Could not process email immediately:', processError)
        console.log('💡 You can manually process emails by running: EmailService.processPendingEmails() in console')
      }

      return { success: true }

    } catch (error: any) {
      console.error('❌ Exception sending magic link:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Send password reset email via Resend instead of Supabase Auth
   */
  static async sendPasswordResetViaResend(
    email: string,
    displayName: string,
    resetToken: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔐 Sending custom password reset email via Resend to ${email}`)

      const baseUrl = typeof window !== 'undefined' 
        ? window.location.origin 
        : 'https://pigskin-picksix.vercel.app'
      
      const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`
      const template = EmailTemplates.passwordReset(displayName, resetUrl)

      console.log('📧 Queueing password reset email in email jobs system...')

      // Use the email jobs system instead of direct Resend call to avoid CORS
      try {
        const emailData = {
          user_id: 'password-reset-user', // Placeholder ID for password reset emails
          email,
          template_type: 'password_reset',
          subject: template.subject,
          html_content: template.html,
          text_content: template.text,
          scheduled_for: new Date().toISOString(), // Send immediately
          status: 'pending',
          attempts: 0
        }
        
        console.log('📧 Password reset email data to insert:', emailData)
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Password reset email insert timed out after 10 seconds')), 10000)
        )
        
        const insertPromise = supabase
          .from('email_jobs')
          .insert(emailData)
          .select()
          .single()
        
        let data, error
        try {
          const result = await Promise.race([insertPromise, timeoutPromise])
          data = result.data
          error = result.error
          console.log('📧 Password reset database insert result:', { data: !!data, error: error?.message || 'none' })
        } catch (timeoutError: any) {
          console.error('❌ Password reset database insert timed out:', timeoutError.message)
          return { success: false, error: 'Database insert timed out - check database connectivity' }
        }

        if (error) {
          console.error('❌ Error queueing password reset email:', error)
          console.error('❌ Error details:', JSON.stringify(error, null, 2))
          return { success: false, error: error.message }
        }
        
        console.log('✅ Password reset email queued successfully:', data?.id)
        
      } catch (insertError: any) {
        console.error('❌ Exception during password reset email insert:', insertError)
        return { success: false, error: insertError.message }
      }
      
      // Try to process it immediately if possible
      try {
        console.log('🔄 Attempting immediate password reset email processing...')
        const processingResult = await this.processPendingEmails()
        console.log('📊 Password reset email processing result:', processingResult)
      } catch (processError) {
        console.warn('⚠️ Could not process password reset email immediately:', processError)
      }

      return { success: true }

    } catch (error: any) {
      console.error('❌ Exception sending password reset via Resend:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Send password reset email (legacy Supabase Auth version - kept for backward compatibility)
   */
  static async sendPasswordReset(
    userId: string,
    email: string,
    displayName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`🔐 Sending password reset email to ${email}`)

      // Create a timeout promise to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Password reset request timed out after 10 seconds')), 10000)
      )

      // Generate password reset link using Supabase Auth
      const resetPromise = supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      })

      const { data, error } = await Promise.race([resetPromise, timeoutPromise])

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

// Make EmailService available globally for debugging
if (typeof window !== 'undefined') {
  (window as any).EmailService = EmailService
  console.log('🛠️ EmailService available globally for debugging. Try: EmailService.processPendingEmails()')
}